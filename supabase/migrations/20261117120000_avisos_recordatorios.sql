-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.avisos.clave
-- @verifica index public.idx_avisos_clave
-- @verifica function public.crear_recordatorio
-- @verifica function public.generar_recordatorios
-- @verifica function-contiene public.trg_aviso_informe_calidad pueden llegar recibos
-- @verifica function-contiene public.trg_aviso_revision_final pueden llegar recibos
-- @verifica function-contiene public.trg_aviso_recibo_nuevo /estimaciones/registro
-- @verifica sin-trigger public.planeacion_items.trg_aviso_liberado
-- @verifica sin-function public.trg_aviso_liberado
--
-- Avisos, segunda versión (sobre la migración avisos_por_area):
--
--   Se QUITA "se liberaron muebles a Producción" (era ruido: quien libera ya lo sabe).
--   Producción
--     · libró un mueble y no lo asignó (pasados 2 días)     → a quien lo liberó (si es de Producción;
--                                                              si no, a toda el área). Recordatorio diario.
--     · asignaciones sin entregar (pasados 3 días)           → a toda el área. Recordatorio diario.
--     · Calidad rechazó un mueble o una parte                → a toda el área, para el reproceso
--                                                              (ya existía; ahora dice si es una parte).
--   Estimaciones
--     · Calidad aprobó un mueble o una parte                 → "pueden llegar recibos" (solo equipos
--                                                              externos y procesos que se cobran con recibo)
--     · recibos sin revisar (pasados 3 días)                 → recordatorio diario
--     · recibos revisados pero sin pagar (pasados 3 días)    → recordatorio diario
--
-- Los recordatorios no nacen de un hecho sino del paso del tiempo, así que los genera
-- `generar_recordatorios()`, que el servidor llama al abrir la campanita (no hace falta pg_cron). Se
-- repiten una vez al día mientras siga pendiente: la `clave` (tipo + destino + día) impide duplicarlos
-- aunque varias personas abran la app a la vez.
--
-- También corrige el enlace del aviso de recibo nuevo: apuntaba a /estimaciones/revision, que no es
-- una pantalla; la bandeja "Por revisar" es /estimaciones/registro?estado=pendiente.

alter table public.avisos add column clave text check (clave is null or char_length(clave) <= 120);
create unique index idx_avisos_clave on public.avisos (clave) where clave is not null;

-- ── Se quita el aviso de "liberado" ─────────────────────────────────────────────────
drop trigger if exists trg_aviso_liberado on public.planeacion_items;
drop function if exists public.trg_aviso_liberado();

-- ── Alta de un recordatorio (una vez por clave) ─────────────────────────────────────
-- Devuelve 1 si lo creó y 0 si ya existía uno con esa clave.
create or replace function public.crear_recordatorio(
  p_clave text, p_area text, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_destinatario uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filas integer;
begin
  insert into public.avisos (area, destinatario_id, tipo, titulo, cuerpo, url, creado_por, clave)
  values (p_area, p_destinatario, p_tipo, left(p_titulo, 80), left(coalesce(p_cuerpo, ''), 200), p_url, null, p_clave)
  on conflict (clave) where clave is not null do nothing;
  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;
revoke execute on function public.crear_recordatorio(text, text, text, text, text, text, uuid) from public, anon, authenticated;

-- "a, b y 3 más" a partir de hasta 3 ejemplos y del total.
create or replace function public.lista_aviso(p_ejemplos text[], p_total integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select array_to_string(p_ejemplos[1:3], '; ')
    || case when p_total > 3 then ' y ' || (p_total - 3) || ' más' else '' end;
$$;
revoke execute on function public.lista_aviso(text[], integer) from public, anon, authenticated;

-- ── Los recordatorios por tiempo ────────────────────────────────────────────────────
-- Cada bloque es independiente: si uno falla, los demás siguen. Devuelve cuántos creó.
create or replace function public.generar_recordatorios(
  p_dias_sin_asignar integer default 2,
  p_dias_sin_entregar integer default 3,
  p_dias_sin_revisar integer default 3,
  p_dias_sin_pagar integer default 3
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_total integer := 0;
  r record;
begin
  -- Muebles liberados que nadie ha asignado → a quien los liberó (si es de Producción) o a toda el área.
  begin
    for r in
      select case when pf.area::text = 'produccion' then i.liberado_por end as destino,
             count(*)::integer as n,
             array_agg(i.modelo || ' · ' || coalesce(public.etiqueta_pedido(pv.pedido_id), '') order by i.liberado_en) as ejemplos
        from public.planeacion_items i
        join public.pedido_versiones pv on pv.id = i.pedido_version_id
        left join public.perfiles pf on pf.id = i.liberado_por
       where i.parent_item_id is null
         and i.estado_liberacion = 'enviado_a_produccion'
         and i.motivo_cancelacion is null
         and i.eliminacion_solicitada_en is null
         and i.liberado_en < now() - make_interval(days => p_dias_sin_asignar)
         and not exists (
           select 1 from public.asignaciones_produccion a
            where a.planeacion_item_id = i.id and a.cancelada_en is null
         )
       group by 1
    loop
      v_total := v_total + public.crear_recordatorio(
        'liberado_sin_asignar:' || coalesce(r.destino::text, 'area') || ':' || v_hoy,
        'produccion', 'liberado_sin_asignar',
        case when r.n = 1 then 'Liberaste 1 mueble y falta asignarlo' else 'Liberaste ' || r.n || ' muebles y falta asignarlos' end,
        public.lista_aviso(r.ejemplos, r.n),
        '/produccion/panel?estado=por_asignar',
        r.destino
      );
    end loop;
  exception when others then
    null;
  end;

  -- Asignaciones que llevan días en el taller sin entregarse → a toda el área de Producción.
  begin
    select count(*)::integer as n,
           array_agg(
             s.modelo || coalesce(' («' || s.parte_descripcion || '»)', '') || ' · ' || s.proceso || ' · ' || s.equipo
               || ' · falta ' || public.cantidad_aviso(s.cantidad - s.entregado)
             order by s.creado_en
           ) as ejemplos
      into r
      from public.asignaciones_produccion_resumen s
     where s.estado in ('en_proceso', 'parcial')
       and s.creado_en < now() - make_interval(days => p_dias_sin_entregar);
    if r.n > 0 then
      v_total := v_total + public.crear_recordatorio(
        'asignado_sin_entregar:' || v_hoy,
        'produccion', 'asignado_sin_entregar',
        case when r.n = 1 then '1 asignación sigue sin entregarse' else r.n || ' asignaciones siguen sin entregarse' end,
        public.lista_aviso(r.ejemplos, r.n),
        '/produccion'
      );
    end if;
  exception when others then
    null;
  end;

  -- Recibos que nadie ha revisado → a Estimaciones.
  begin
    select count(*)::integer as n, array_agg(re.folio order by re.creado_en) as folios
      into r
      from public.recibos re
     where re.estado = 'pendiente'
       and re.creado_en < now() - make_interval(days => p_dias_sin_revisar);
    if r.n > 0 then
      v_total := v_total + public.crear_recordatorio(
        'recibos_sin_revisar:' || v_hoy,
        'estimaciones', 'recibos_sin_revisar',
        case when r.n = 1 then '1 recibo lleva días sin revisarse' else r.n || ' recibos llevan días sin revisarse' end,
        public.lista_aviso(r.folios, r.n),
        '/estimaciones/registro?estado=pendiente'
      );
    end if;
  exception when others then
    null;
  end;

  -- Recibos ya revisados que siguen sin pagarse → a Estimaciones.
  begin
    select count(*)::integer as n, array_agg(re.folio order by re.revisado_en) as folios
      into r
      from public.recibos re
     where re.estado = 'revisado'
       and re.revisado_en < now() - make_interval(days => p_dias_sin_pagar);
    if r.n > 0 then
      v_total := v_total + public.crear_recordatorio(
        'recibos_sin_pagar:' || v_hoy,
        'estimaciones', 'recibos_sin_pagar',
        case when r.n = 1 then '1 recibo revisado sigue sin pagarse' else r.n || ' recibos revisados siguen sin pagarse' end,
        public.lista_aviso(r.folios, r.n),
        '/estimaciones/registro?estado=revisado'
      );
    end if;
  exception when others then
    null;
  end;

  return v_total;
end;
$$;
revoke execute on function public.generar_recordatorios(integer, integer, integer, integer) from public, anon, authenticated;

-- ── Calidad evaluó una entrega (de un mueble o de una parte) ────────────────────────
-- Rechazo → Producción, para que reproceses. Aprobación → Producción (como antes) y, si es de un equipo
-- externo y de un proceso que se cobra con recibo, a Estimaciones ("pueden llegar recibos").
create or replace function public.trg_aviso_informe_calidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  i record;
  v_parte text;
  v_proceso text;
  v_planta boolean;
  v_desde_partes boolean := false;
  v_asignacion uuid;
  v_donde text;
begin
  begin
    -- Solo las evaluaciones de entregas; los demás informes (no conformidades, incidencias) no avisan aquí.
    if new.entrega_id is null and new.entrega_parte_id is null then
      return new;
    end if;
    select pi.modelo, pv.pedido_id into i
      from public.planeacion_items pi
      left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
     where pi.id = new.planeacion_item_id;

    if new.entrega_parte_id is not null then
      select ep.asignacion_id, pd.descripcion into v_asignacion, v_parte
        from public.entregas_partes_produccion ep
        left join public.partes_despiece pd on pd.id = ep.parte_id
       where ep.id = new.entrega_parte_id;
    else
      select e.asignacion_id, e.desde_partes into v_asignacion, v_desde_partes
        from public.entregas_produccion e where e.id = new.entrega_id;
    end if;
    select a.proceso, q.es_planta into v_proceso, v_planta
      from public.asignaciones_produccion a
      left join public.equipos_produccion q on q.id = a.equipo_id
     where a.id = v_asignacion;

    v_donde := concat_ws(' · ', nullif(btrim(i.modelo), ''),
      case when v_parte is not null then 'Parte: ' || btrim(v_parte) end,
      public.etiqueta_pedido(i.pedido_id));

    if new.aprobado then
      perform public.crear_aviso(
        'produccion', 'calidad_aprobo',
        'Calidad aprobó ' || public.cantidad_aviso(new.cantidad) || ' pz', v_donde, '/produccion/panel'
      );
      -- A Estimaciones solo lo que de verdad puede cobrarse: equipos externos, Armado o Acabados, y no la
      -- aprobación del mueble que la base arma sola a partir de sus partes (esas ya avisaron una a una).
      if not coalesce(v_planta, false) and not v_desde_partes
         and (v_proceso is null or v_proceso in ('armado', 'barniz')) then
        perform public.crear_aviso(
          'estimaciones', 'calidad_aprobo_cobro',
          'Ya pueden llegar recibos: ' || public.cantidad_aviso(new.cantidad) || ' pz aprobadas',
          concat_ws(' · ', v_donde, case v_proceso when 'armado' then 'Armado' when 'barniz' then 'Acabados' end),
          '/estimaciones/por-llegar'
        );
      end if;
    else
      perform public.crear_aviso(
        'produccion', 'calidad_rechazo',
        case when v_parte is not null
          then 'Calidad rechazó ' || public.cantidad_aviso(new.cantidad) || ' pz de una parte: a reprocesar'
          else 'Calidad rechazó ' || public.cantidad_aviso(new.cantidad) || ' pz: a reprocesar' end,
        concat_ws(' · ', v_donde, left(btrim(coalesce(new.descripcion, '')), 80)),
        '/produccion/rechazos'
      );
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke execute on function public.trg_aviso_informe_calidad() from public, anon, authenticated;

-- ── Calidad hizo la revisión final del mueble completo ──────────────────────────────
create or replace function public.trg_aviso_revision_final()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  i record;
  v_donde text;
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
      perform public.crear_aviso(
        'estimaciones', 'calidad_aprobo_cobro',
        'Ya pueden llegar recibos: mueble completo aprobado (' || public.cantidad_aviso(new.cantidad) || ' pz)',
        v_donde, '/estimaciones/por-llegar'
      );
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

-- ── Recibo nuevo: el enlace llevaba a una pantalla que no existe ────────────────────
create or replace function public.trg_aviso_recibo_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.estado = 'pendiente' then
      perform public.crear_aviso(
        'estimaciones', 'recibo_nuevo', 'Recibo nuevo por revisar',
        concat_ws(' · ', nullif(btrim(coalesce(new.folio, '')), ''), nullif(btrim(coalesce(new.contratista, '')), ''),
          case when nullif(btrim(coalesce(new.ot, '')), '') is not null then 'O.T. ' || btrim(new.ot) end),
        '/estimaciones/registro?estado=pendiente'
      );
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke execute on function public.trg_aviso_recibo_nuevo() from public, anon, authenticated;

update public.avisos set url = '/estimaciones/registro?estado=pendiente' where url = '/estimaciones/revision';
-- Los avisos de "liberado" que ya existían dejan de mostrarse.
delete from public.avisos where tipo = 'liberado';

-- Para deshacer (los triggers y funciones anteriores están en avisos_por_area):
--   drop function public.generar_recordatorios(integer, integer, integer, integer), public.crear_recordatorio(text, text, text, text, text, text, uuid), public.lista_aviso(text[], integer);
--   drop index public.idx_avisos_clave; alter table public.avisos drop column clave;
