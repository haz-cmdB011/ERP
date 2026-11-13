-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.partes_despiece.procesos_omitidos
-- @verifica function public.guardar_procesos_parte
-- @verifica function-contiene public.cobertura_por_partes procesos_omitidos
-- @verifica function-contiene public.crear_asignacion_produccion pieza(s) por asignar
-- @verifica function-contiene public.piezas_listas_revision_final procesos_omitidos
-- @verifica function-contiene public.verificado_produccion_variante x.proceso)
-- @verifica function-contiene public.aprobado_calidad_variante x.proceso)

-- ============================================================================
-- Producción — las partes del despiece se asignan en PIEZAS y cada parte tiene
-- su propia ruta (fase 2 del despiece por partes).
--
--   * Una asignación de una parte (parte_id) va en piezas de esa parte, no en
--     muebles: la Tabla (3 por mueble, 13 muebles) tiene 39 piezas y se pueden
--     asignar 20. Sus entregas y lotes también van en piezas. El tope de un paso
--     para una parte es piezas por mueble × cantidad del mueble. La asignación
--     lleva la unidad de la parte.
--   * Lo del mueble completo (solo muebles sin componentes, o asignaciones
--     viejas) sigue en muebles y cuenta para todas sus partes (× piezas por mueble).
--   * Ruta por parte: cada parte puede saltarse procesos de la ruta del mueble
--     (partes_despiece.procesos_omitidos, ej. el herraje no pasa por Barniz).
--     No se le asigna un proceso que omite; en ese paso no cuenta para el avance.
--   * La cobertura (un mueble cuenta cuando todas sus partes) pasa piezas a
--     muebles (÷ piezas por mueble) y solo mira las partes que llevan el proceso
--     del paso. La revisión final toma de cada parte su último paso.
--   * Las 3 asignaciones por parte que había (de prueba, en muebles) se cancelan
--     y sus entregas se anulan: se vuelven a asignar ya en piezas.
-- ============================================================================

-- 1. Ruta por parte -----------------------------------------------------------------------
alter table public.partes_despiece
  add column procesos_omitidos text[] not null default '{}',
  add constraint partes_despiece_procesos_omitidos_check check (
    procesos_omitidos <@ array['armado', 'barniz', 'electrificacion', 'superficie_solida']::text[]
  );

-- Qué procesos de la ruta se salta una parte. Un proceso con asignaciones vigentes de
-- esa parte no se puede quitar.
create or replace function public.guardar_procesos_parte(p_parte_id uuid, p_omitidos text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parte record;
  v_omitidos text[] := coalesce((select array_agg(distinct x order by x) from unnest(p_omitidos) as x), '{}');
  v_proceso text;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede cambiar los procesos de una parte.';
  end if;
  if not (v_omitidos <@ array['armado', 'barniz', 'electrificacion', 'superficie_solida']::text[]) then
    raise exception 'Proceso no válido.';
  end if;

  select pd.id, pd.descripcion, pd.procesos_omitidos into v_parte
    from public.partes_despiece pd
    where pd.id = p_parte_id and pd.retirada_en is null
    for update;
  if not found then
    raise exception 'Esa parte ya no está en el despiece; recarga la página.';
  end if;

  foreach v_proceso in array v_omitidos loop
    if exists (
      select 1 from public.asignaciones_produccion a
      where a.parte_id = p_parte_id and a.proceso = v_proceso and a.cancelada_en is null
    ) then
      raise exception '"%" ya tiene asignaciones de %: cancélalas antes de quitarle ese proceso.',
        v_parte.descripcion, v_proceso;
    end if;
  end loop;

  update public.partes_despiece set procesos_omitidos = v_omitidos where id = p_parte_id;
end;
$$;

revoke execute on function public.guardar_procesos_parte(uuid, text[]) from public, anon;
grant execute on function public.guardar_procesos_parte(uuid, text[]) to authenticated;

-- 2. Cobertura en muebles, con piezas por parte y solo las partes que llevan el proceso ---
-- p_mueble: lo del mueble completo (muebles); p_por_parte: {"<parte_id>": piezas}.
-- Sin partes vigentes, solo cuenta lo del mueble. Si ninguna parte lleva el proceso, el
-- paso no les aplica: cuenta como completo.
drop function public.cobertura_por_partes(uuid, numeric, jsonb);

create function public.cobertura_por_partes(
  p_item_id uuid,
  p_mueble numeric,
  p_por_parte jsonb,
  p_proceso text default null
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with partes as (
    select pd.id, pd.piezas_por_mueble, pd.procesos_omitidos
    from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
  ),
  aplican as (
    select p.id, p.piezas_por_mueble from partes p
    where p_proceso is null or not (p_proceso = any (p.procesos_omitidos))
  )
  select case
    when not exists (select 1 from partes) then coalesce(p_mueble, 0)
    when not exists (select 1 from aplican) then
      (select pi.cantidad_total from public.planeacion_items pi where pi.id = p_item_id)
    else coalesce(p_mueble, 0) + (
      select trunc(min(coalesce((p_por_parte ->> a.id::text)::numeric, 0) / a.piezas_por_mueble), 2)
      from aplican a
    )
  end;
$$;

revoke execute on function public.cobertura_por_partes(uuid, numeric, jsonb, text) from public, anon;
grant execute on function public.cobertura_por_partes(uuid, numeric, jsonb, text) to authenticated;

-- 3. Asignar: una parte en piezas y solo en los procesos que lleva -------------------------
create or replace function public.crear_asignacion_produccion(
  p_item_id uuid,
  p_equipo_id uuid,
  p_proceso text,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text,
  p_encargado text default null,
  p_paso_id uuid default null,
  p_parte_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_equipo record;
  v_paso record;
  v_parte record;
  v_anterior record;
  v_asignado numeric;
  v_asignado_parte numeric := 0;
  v_max_parte numeric;
  v_tope numeric;
  v_ya numeric;
  v_listo_mueble numeric;
  v_listo_partes jsonb;
  v_listo numeric;
  v_adelantada boolean := false;
  v_encargado text := nullif(btrim(coalesce(p_encargado, '')), '');
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede asignar.';
  end if;
  if p_proceso is null
     or p_proceso not in ('armado', 'barniz', 'electrificacion', 'superficie_solida') then
    raise exception 'Proceso no válido.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_fecha_asignacion is null then
    raise exception 'Falta la fecha de asignación.';
  end if;
  if v_encargado is not null and char_length(v_encargado) > 80 then
    raise exception 'El nombre del encargado es demasiado largo.';
  end if;

  -- Bloquea el ítem: dos asignaciones simultáneas del mismo mueble se
  -- atienden una tras otra y no pueden pasarse juntas de la cantidad.
  select pi.id, pi.item_code, pi.modelo, pi.descripcion, pi.unidad, pi.cantidad_total,
         pi.tipo_registro, pi.estado_liberacion, pi.eliminacion_solicitada_en,
         pi.estado_revision, pv.es_version_activa,
         p.id as pedido_id, p.numero_pedido, p.eliminado_en, p.cancelado_en
    into v_item
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    join public.pedidos p on p.id = pv.pedido_id
    where pi.id = p_item_id
    for update of pi;

  if not found then
    raise exception 'El ítem no existe.';
  end if;
  if v_item.tipo_registro <> 'MO' then
    raise exception 'Solo se asignan muebles (ítems padre), no componentes.';
  end if;
  if not v_item.es_version_activa then
    raise exception 'El ítem es de una versión anterior del PM; asigna desde la versión activa.';
  end if;
  if v_item.estado_liberacion <> 'enviado_a_produccion' then
    raise exception 'El ítem % todavía no está liberado a producción.', v_item.item_code;
  end if;
  if v_item.eliminacion_solicitada_en is not null
     or v_item.estado_revision = 'cancelado'
     or v_item.eliminado_en is not null
     or v_item.cancelado_en is not null then
    raise exception 'El ítem % o su PM está cancelado o eliminado.', v_item.item_code;
  end if;
  -- Solo se electrifica lo que la lleva (en el mueble o en sus componentes).
  if p_proceso = 'electrificacion'
     and not public.admite_electrificacion(v_item.id) then
    raise exception 'El ítem % no lleva electrificación ni iluminación; no se asigna a Electrificación.', v_item.item_code;
  end if;
  -- Superficie Sólida, igual: solo si el mueble o sus componentes la llevan.
  if p_proceso = 'superficie_solida'
     and not public.admite_superficie_solida(v_item.id) then
    raise exception 'El ítem % no lleva superficie sólida; no se asigna a Superficie Sólida.', v_item.item_code;
  end if;

  -- Con componentes en el PM, primero el despiece (despiece_porcentaje_obligatorio).
  if public.requiere_despiece(v_item.id) then
    raise exception 'El ítem % tiene componentes: guarda su despiece antes de asignarlo.', v_item.item_code;
  end if;

  -- Con componentes, solo por partes (asignar_por_partes_con_componentes).
  if p_parte_id is null and public.tiene_componentes(v_item.id) then
    raise exception 'El ítem % tiene componentes: asígnalo por partes de su despiece.', v_item.item_code;
  end if;

  -- La parte, si se asigna una: vigente, de este mueble y que lleve el proceso.
  if p_parte_id is not null then
    select pd.id, pd.descripcion, pd.piezas_por_mueble, pd.unidad, pd.procesos_omitidos into v_parte
      from public.partes_despiece pd
      where pd.id = p_parte_id and pd.planeacion_item_id = v_item.id and pd.retirada_en is null;
    if not found then
      raise exception 'Esa parte ya no está en el despiece del ítem %; recarga la página.', v_item.item_code;
    end if;
    if p_proceso = any (v_parte.procesos_omitidos) then
      raise exception '"%" no lleva %.', v_parte.descripcion, p_proceso;
    end if;
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (p_proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, p_proceso;
  end if;

  -- Tope del paso: en muebles, o para una parte, en sus piezas.
  v_tope := case when p_parte_id is null then v_item.cantidad_total
                 else v_item.cantidad_total * v_parte.piezas_por_mueble end;

  -- El paso de la ruta (la sugerida si el mueble aún no tiene).
  perform public.asegurar_ruta_produccion(v_item.id);
  if p_paso_id is not null then
    select s.id, s.orden, s.proceso into v_paso
      from public.pasos_ruta_produccion s
      where s.id = p_paso_id and s.planeacion_item_id = v_item.id and s.retirado_en is null;
    if not found then
      raise exception 'Ese paso ya no está en la ruta del ítem %; recarga la página.', v_item.item_code;
    end if;
    if v_paso.proceso <> p_proceso then
      raise exception 'El paso % de la ruta es de %, no de %.', v_paso.orden, v_paso.proceso, p_proceso;
    end if;
  else
    -- El primer paso de ese proceso donde todavía cabe.
    select s.id, s.orden, s.proceso into v_paso
      from public.pasos_ruta_produccion s
      where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.proceso = p_proceso
        and (
          select case
            when p_parte_id is null then
              coalesce(sum(a.cantidad) filter (where a.parte_id is null), 0) + coalesce((
                select max(t.n / pd.piezas_por_mueble) from (
                  select b.parte_id, sum(b.cantidad) as n from public.asignaciones_produccion b
                  where b.paso_id = s.id and b.cancelada_en is null and b.informe_rechazo_id is null
                    and b.revision_final_rechazo_id is null and b.parte_id is not null
                  group by b.parte_id
                ) t join public.partes_despiece pd on pd.id = t.parte_id
              ), 0)
            else
              coalesce(sum(a.cantidad) filter (where a.parte_id is null), 0) * v_parte.piezas_por_mueble
              + coalesce(sum(a.cantidad) filter (where a.parte_id = p_parte_id), 0)
          end
          from public.asignaciones_produccion a
          where a.paso_id = s.id and a.cancelada_en is null and a.informe_rechazo_id is null
            and a.revision_final_rechazo_id is null
        ) < v_tope
      order by s.orden
      limit 1;
    if not found then
      if exists (
        select 1 from public.pasos_ruta_produccion s
        where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.proceso = p_proceso
      ) then
        raise exception 'Ya está asignado todo el ítem % en %.', v_item.item_code, p_proceso;
      end if;
      raise exception 'La ruta del ítem % no lleva %; agrégalo a la ruta primero.', v_item.item_code, p_proceso;
    end if;
  end if;

  -- Tope por paso. Los retrabajos no cuentan (de un lote o de la revisión final). Lo
  -- del mueble completo cuenta para todas sus partes.
  select coalesce(sum(cantidad) filter (where parte_id is null), 0),
         coalesce(sum(cantidad) filter (where parte_id = p_parte_id), 0)
    into v_asignado, v_asignado_parte
    from public.asignaciones_produccion
    where paso_id = v_paso.id and cancelada_en is null and informe_rechazo_id is null
      and revision_final_rechazo_id is null;

  if p_parte_id is null then
    select coalesce(max(t.n / pd.piezas_por_mueble), 0) into v_max_parte
      from (
        select parte_id, sum(cantidad) as n from public.asignaciones_produccion
        where paso_id = v_paso.id and cancelada_en is null and informe_rechazo_id is null
          and revision_final_rechazo_id is null and parte_id is not null
        group by parte_id
      ) t
      join public.partes_despiece pd on pd.id = t.parte_id;
    v_ya := v_asignado + v_max_parte;
    if v_ya + p_cantidad > v_tope then
      raise exception 'En el paso % (%) solo quedan % por asignar de % (ya asignadas: %).',
        v_paso.orden, p_proceso, v_tope - v_ya, v_tope, v_ya;
    end if;
  else
    v_ya := v_asignado * v_parte.piezas_por_mueble + v_asignado_parte;
    if v_ya + p_cantidad > v_tope then
      raise exception 'En el paso % (%), "%" solo tiene % pieza(s) por asignar de % (ya asignadas: %).',
        v_paso.orden, p_proceso, v_parte.descripcion, v_tope - v_ya, v_tope, v_ya;
    end if;
  end if;

  -- ¿Se adelanta al paso anterior? Listo = lo que el paso anterior entregó y Producción
  -- verificó. Para una parte, su paso anterior es el último antes de este que la parte
  -- lleva, y cuenta lo del mueble completo (× sus piezas) más lo suyo; para el mueble
  -- completo, el paso anterior de la ruta y lo de su parte más atrasada. No se bloquea:
  -- queda marcado.
  select s.id, s.proceso into v_anterior
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.orden < v_paso.orden
      and (p_parte_id is null or not (s.proceso = any (v_parte.procesos_omitidos)))
    order by s.orden desc
    limit 1;
  if found then
    select coalesce(sum(x.cantidad) filter (where a.parte_id is null), 0)
      into v_listo_mueble
      from public.entregas_produccion x
      join public.asignaciones_produccion a on a.id = x.asignacion_id
      where a.paso_id = v_anterior.id and a.cancelada_en is null and a.informe_rechazo_id is null
        and a.revision_final_rechazo_id is null
        and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null;
    select coalesce(jsonb_object_agg(t.parte_id, t.n), '{}'::jsonb)
      into v_listo_partes
      from (
        select a.parte_id, sum(x.cantidad) as n
        from public.entregas_produccion x
        join public.asignaciones_produccion a on a.id = x.asignacion_id
        where a.paso_id = v_anterior.id and a.cancelada_en is null and a.informe_rechazo_id is null
          and a.revision_final_rechazo_id is null and a.parte_id is not null
          and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null
        group by a.parte_id
      ) t;
    if p_parte_id is null then
      v_listo := public.cobertura_por_partes(v_item.id, v_listo_mueble, v_listo_partes, v_anterior.proceso);
    else
      v_listo := v_listo_mueble * v_parte.piezas_por_mueble
        + coalesce((v_listo_partes ->> p_parte_id::text)::numeric, 0);
    end if;
    v_adelantada := v_ya + p_cantidad > v_listo;
  end if;

  -- El nombre queda guardado en el equipo para elegirlo la próxima vez.
  if v_encargado is not null then
    insert into public.encargados_equipo_produccion (equipo_id, nombre)
    values (p_equipo_id, v_encargado)
    on conflict (equipo_id, lower(btrim(nombre))) do nothing;
  end if;

  insert into public.asignaciones_produccion (
    planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad,
    equipo_id, proceso, cantidad, fecha_asignacion, notas, creado_por, encargado,
    paso_id, adelantada, parte_id
  ) values (
    v_item.id, v_item.pedido_id, v_item.numero_pedido, v_item.item_code, v_item.modelo,
    v_item.descripcion,
    -- Una parte va en sus piezas: con su unidad.
    case when p_parte_id is null then v_item.unidad else coalesce(v_parte.unidad, v_item.unidad) end,
    p_equipo_id, p_proceso, p_cantidad,
    p_fecha_asignacion, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado,
    v_paso.id, v_adelantada, p_parte_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 4. Revisión final: de cada parte, lo verificado en SU último paso --------------------------
create or replace function public.piezas_listas_revision_final(p_item_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  with pasos as (
    select s.id, s.orden, s.proceso
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.retirado_en is null
  ),
  ultimo as (
    select id from pasos order by orden desc limit 1
  ),
  -- Todo lo que verificó Producción, menos lo que Calidad rechazó en esos lotes (va a
  -- retrabajo y vuelve a contar cuando se entregue otra vez).
  l as (
    select a.parte_id, a.paso_id, l.cantidad - l.rechazadas as n
    from public.lotes_calidad l
    join public.asignaciones_produccion a on a.id = l.asignacion_id
    where a.planeacion_item_id = p_item_id and a.cancelada_en is null and l.vigente
  ),
  -- Cada parte en muebles, en el último paso de la ruta que la parte lleva.
  partes as (
    select pd.id,
      (select coalesce(sum(l.n), 0) from l
       where l.parte_id = pd.id
         and l.paso_id = (
           select p.id from pasos p
           where not (p.proceso = any (pd.procesos_omitidos))
           order by p.orden desc limit 1
         )) / pd.piezas_por_mueble as muebles
    from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
      and exists (select 1 from pasos p where not (p.proceso = any (pd.procesos_omitidos)))
  )
  select (select coalesce(sum(n), 0) from l where parte_id is null and paso_id = (select id from ultimo))
    + coalesce((select trunc(min(muebles), 2) from partes), 0);
$$;

-- 5. Cobro: la cobertura de cada paso con su proceso -----------------------------------------
do $$
declare
  v_nombre text;
  v_def text;
  v_nueva text;
begin
  foreach v_nombre in array array['verificado_produccion_variante', 'aprobado_calidad_variante'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_nombre;
    v_nueva := replace(v_def,
      $r$filter (where x.parte_id is not null), '{}'::jsonb)) as n$r$,
      $r$filter (where x.parte_id is not null), '{}'::jsonb), x.proceso) as n$r$);
    if v_nueva = v_def then
      raise exception '% no trae la llamada esperada a cobertura_por_partes.', v_nombre;
    end if;
    execute v_nueva;
  end loop;
end;
$$;

-- 6. Las asignaciones por parte que había (de prueba, en muebles) se cancelan --------------
update public.entregas_produccion e
  set anulada_en = now(),
      motivo_anulacion = 'Asignación por parte en muebles: las partes ahora se asignan en piezas (migración partes_en_piezas_y_ruta_por_parte).'
  from public.asignaciones_produccion a
  where a.id = e.asignacion_id and a.parte_id is not null and a.cancelada_en is null
    and e.anulada_en is null;

update public.asignaciones_produccion
  set cancelada_en = now(),
      motivo_cancelacion = 'Las partes ahora se asignan en piezas (migración partes_en_piezas_y_ruta_por_parte).'
  where parte_id is not null and cancelada_en is null;
