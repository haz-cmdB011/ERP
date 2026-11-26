-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.trg_aviso_entrega_parte
-- @verifica trigger public.entregas_partes_produccion.trg_aviso_entrega_parte
-- @verifica function-contiene public.trg_aviso_entrega entrega_partes:
-- @verifica function-contiene public.trg_aviso_revision_final es_planta
--
-- Avisos que faltaban (sobre avisos_por_area y avisos_recordatorios):
--
--   · Producción entregó piezas por partes del despiece → Calidad. Antes no avisaba nada al registrar
--     las piezas; solo, cuando las partes completaban un mueble, salía "Producción entregó N pza" de la
--     entrega del mueble que arma la base (`desde_partes`), que Calidad no evalúa directo. Ahora sale UN
--     aviso por entrega ("Producción entregó 12 pz de 2 partes", con cada parte y el folio) y, si con eso
--     se completan muebles, lo dice en el mismo aviso en lugar de mandar otro.
--   · "Ya pueden llegar recibos" de la revisión final → Estimaciones solo si el mueble tuvo trabajo de un
--     equipo externo en Armado o Acabados (lo que se cobra con recibo). Antes avisaba siempre, también
--     de muebles hechos solo en planta, que nadie va a cobrar.
--
-- Como registrar_entrega_partes inserta una fila por parte, el aviso se arma con la `clave`
-- (asignación + transacción): la primera parte lo crea y las siguientes lo completan. Todas las partes de
-- una entrega comparten `registrado_en` (= now() de la transacción). Igual que los demás avisos, si algo
-- falla al armarlo, la entrega se registra como si nada.

-- ── Producción entregó piezas por partes ───────────────────────────────────────────
create or replace function public.trg_aviso_entrega_parte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  v_partes integer;
  v_piezas numeric;
  v_lista text;
  v_titulo text;
  v_cuerpo text;
begin
  begin
    select modelo, pedido_id into a from public.asignaciones_produccion where id = new.asignacion_id;

    -- Todas las partes de esta misma entrega (misma asignación, misma transacción).
    select count(*)::integer,
           sum(ep.piezas),
           string_agg(coalesce(nullif(btrim(pd.descripcion), ''), 'Parte') || ' ' || public.cantidad_aviso(ep.piezas),
                      ', ' order by pd.descripcion, ep.id)
      into v_partes, v_piezas, v_lista
      from public.entregas_partes_produccion ep
      left join public.partes_despiece pd on pd.id = ep.parte_id
     where ep.asignacion_id = new.asignacion_id
       and ep.registrado_en = new.registrado_en;

    v_titulo := 'Producción entregó ' || public.cantidad_aviso(v_piezas) || ' pz de '
      || case when v_partes = 1 then '1 parte' else v_partes || ' partes' end;
    v_cuerpo := concat_ws(' · ', nullif(btrim(a.modelo), ''), public.etiqueta_pedido(a.pedido_id), v_lista,
      nullif('folio ' || btrim(coalesce(new.folios_calidad, '')), 'folio '));

    insert into public.avisos (area, tipo, titulo, cuerpo, url, clave)
    values ('calidad', 'entrega_partes', left(v_titulo, 80), left(v_cuerpo, 200), '/calidad/entregas',
            'entrega_partes:' || new.asignacion_id || ':' || txid_current())
    on conflict (clave) where clave is not null
    do update set titulo = excluded.titulo, cuerpo = excluded.cuerpo;
  exception when others then
    null; -- un aviso que no se pudo armar nunca frena la entrega
  end;
  return new;
end;
$$;
revoke execute on function public.trg_aviso_entrega_parte() from public, anon, authenticated;

drop trigger if exists trg_aviso_entrega_parte on public.entregas_partes_produccion;
create trigger trg_aviso_entrega_parte
  after insert on public.entregas_partes_produccion
  for each row execute function public.trg_aviso_entrega_parte();

-- ── Producción registró una entrega (del mueble o de una parte asignada sola) ───────
-- Si la entrega es la que arma la base porque las partes completaron muebles (se inserta en la misma
-- transacción que esas partes), no se manda otro aviso: se agrega al de las partes cuántos completa.
create or replace function public.trg_aviso_entrega()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  begin
    if new.anulada_en is not null then
      return new;
    end if;
    if exists (
      select 1 from public.entregas_partes_produccion ep
       where ep.asignacion_id = new.asignacion_id and ep.registrado_en = now()
    ) then
      update public.avisos
         set cuerpo = left('Completa ' || public.cantidad_aviso(new.cantidad)
                           || case when new.cantidad = 1 then ' mueble' else ' muebles' end
                           || ' · ' || cuerpo, 200)
       where clave = 'entrega_partes:' || new.asignacion_id || ':' || txid_current();
      return new;
    end if;
    select modelo, unidad, pedido_id into a from public.asignaciones_produccion where id = new.asignacion_id;
    perform public.crear_aviso(
      'calidad', 'entrega',
      'Producción entregó ' || public.cantidad_aviso(new.cantidad) || ' ' || coalesce(nullif(btrim(a.unidad), ''), 'pza'),
      concat_ws(' · ', nullif(btrim(a.modelo), ''), public.etiqueta_pedido(a.pedido_id), nullif('folio ' || btrim(coalesce(new.folios_calidad, '')), 'folio ')),
      '/calidad/entregas'
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke execute on function public.trg_aviso_entrega() from public, anon, authenticated;

-- ── Calidad hizo la revisión final del mueble completo ──────────────────────────────
-- A Estimaciones solo si hay algo que cobrar con recibo: trabajo de un equipo externo en Armado o
-- Acabados (la misma regla del aviso por entrega y de "Por llegar").
create or replace function public.trg_aviso_revision_final()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  i record;
  v_donde text;
  v_areas text;
begin
  begin
    select pi.modelo, pv.pedido_id into i
      from public.planeacion_items pi
      left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
     where pi.id = new.planeacion_item_id;
    v_donde := concat_ws(' · ', nullif(btrim(i.modelo), ''), public.etiqueta_pedido(i.pedido_id));

    if new.aprobado then
      perform public.crear_aviso(
        'produccion', 'calidad_aprobo',
        'Calidad aprobó el mueble completo (' || public.cantidad_aviso(new.cantidad) || ' pz)', v_donde, '/produccion/panel'
      );
      select string_agg(x.area, ' y ' order by x.area desc) into v_areas
        from (
          select distinct case a.proceso when 'armado' then 'Armado' else 'Acabados' end as area
            from public.asignaciones_produccion a
            join public.equipos_produccion q on q.id = a.equipo_id
           where a.planeacion_item_id = new.planeacion_item_id
             and a.cancelada_en is null
             and not coalesce(q.es_planta, false)
             and a.proceso in ('armado', 'barniz')
        ) x;
      if v_areas is not null then
        perform public.crear_aviso(
          'estimaciones', 'calidad_aprobo_cobro',
          'Ya pueden llegar recibos: mueble completo aprobado (' || public.cantidad_aviso(new.cantidad) || ' pz)',
          concat_ws(' · ', v_donde, v_areas), '/estimaciones/por-llegar'
        );
      end if;
    else
      perform public.crear_aviso(
        'produccion', 'calidad_rechazo',
        'Calidad rechazó en la revisión final ' || public.cantidad_aviso(new.cantidad) || ' pz: a reprocesar',
        concat_ws(' · ', v_donde, left(btrim(coalesce(new.motivo, '')), 80)),
        '/produccion/rechazos'
      );
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke execute on function public.trg_aviso_revision_final() from public, anon, authenticated;

-- Para deshacer (las versiones anteriores de trg_aviso_entrega y trg_aviso_revision_final están en
-- avisos_por_area y avisos_recordatorios):
--   drop trigger trg_aviso_entrega_parte on public.entregas_partes_produccion;
--   drop function public.trg_aviso_entrega_parte();
