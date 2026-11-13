-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.pasos_ruta_produccion.parte_id
-- @verifica column public.partes_despiece.ruta_guardada_en
-- @verifica constraint public.pasos_ruta_produccion.pasos_ruta_produccion_proceso_check
-- @verifica constraint public.asignaciones_produccion.asignaciones_produccion_proceso_check
-- @verifica sin-function public.admite_ensamble
-- @verifica sin-function public.equipo_hace
-- @verifica sin-function public.cobertura_por_partes
-- @verifica function public.vez_paso_ruta
-- @verifica function public.muebles_por_partes
-- @verifica function public.cobertura_partes_vez
-- @verifica function-contiene public.asegurar_ruta_produccion ruta_guardada_en
-- @verifica function-contiene public.ruta_sugerida_produccion superficie_solida
-- @verifica function-contiene public.crear_asignacion_produccion no es de la ruta
-- @verifica function-contiene public.guardar_ruta_produccion p_parte_id
-- @verifica function-contiene public.crear_retrabajo_produccion v_r.proceso = any(v_equipo.procesos)
-- @verifica function-contiene public.crear_retrabajo_revision_final v_sig.objetivo
-- @verifica function-contiene public.siguiente_paso_revision_final objetivo
-- @verifica function-contiene public.piezas_listas_revision_final muebles_por_partes
-- @verifica function-contiene public.verificado_produccion_variante cobertura_partes_vez
-- @verifica function-contiene public.aprobado_calidad_variante cobertura_partes_vez
-- @verifica function-contiene public.veces_proceso_ruta parte_id
-- @verifica function-contiene public.muebles_en_calidad ruta_guardada_en
-- @verifica function-contiene public.guardar_procesos_parte ya no se usa

-- ============================================================================
-- Producción — la ruta del mueble es SOLO del mueble completo y cada parte del
-- despiece tiene la suya. Reemplaza el Ensamble de ensamble_produccion.
--
--   * pasos_ruta_produccion.parte_id: null = paso del mueble completo; con valor =
--     paso de esa parte. Cada parte tiene su propia lista de procesos, en orden y con
--     repeticiones (la Tabla: Armado → Barniz; el herraje: Armado). Agregar un paso al
--     mueble no lo agrega a sus partes ni al revés. procesos_omitidos ya no se usa.
--   * Una parte que nunca guardó su ruta (ruta_guardada_en null) toma la sugerida
--     (la misma del mueble) cuando se asigna o se guarda alguna ruta del mueble
--     (asegurar_ruta_produccion). Un mueble con partes nace con su ruta vacía:
--     Producción le agrega lo que se hace al mueble completo.
--   * El Ensamble deja de ser un proceso: ensamblar es un Armado del mueble completo
--     que Producción agrega a la ruta del mueble cuando aplica. El único paso de
--     Ensamble que había (sin asignaciones) queda como Armado.
--   * Orden: primero las rutas de las partes y después la del mueble. Lo listo para
--     el primer paso del mueble es lo que alcanza la parte más atrasada en su último
--     paso (muebles_por_partes). Sin pasos del mueble, la revisión final cuenta eso
--     mismo; con pasos, lo del último paso del mueble.
--   * Cobro (Estimaciones, sin cambios de fondo): un paso del mueble cuenta lo suyo;
--     los pasos de las partes se juntan por proceso y vez (el 1er Armado de cada parte)
--     y cuentan lo de la parte más atrasada (cobertura_partes_vez). Un proceso se cobra
--     tantas veces como pasos tenga el mueble más la parte que más veces lo lleve
--     (veces_proceso_ruta). Lo de los recibos por partes queda para después.
--   * Revisión final: lo rechazado puede regresar a un paso del mueble o de una parte;
--     desde una parte sigue el resto de la ruta de esa parte (en sus piezas) y luego
--     la del mueble.
--   * crear_asignacion_produccion ya no lee la parte cuando se asigna el mueble completo
--     (desde partes_en_piezas_y_ruta_por_parte fallaba con "record v_parte is not assigned
--     yet" al asignar un mueble sin partes; no había pasado porque no se había hecho).
--   * Datos: en los muebles con partes, los pasos del mueble (antes del Ensamble, si
--     lo había) se copian a cada parte que los llevaba, las asignaciones de cada parte
--     se pasan a su paso, y esos pasos del mueble se quitan si no les quedan
--     asignaciones del mueble completo.
-- ============================================================================

-- 1. Columnas --------------------------------------------------------------------------------
alter table public.pasos_ruta_produccion
  add column parte_id uuid references public.partes_despiece(id);

create index idx_pasos_ruta_produccion_parte on public.pasos_ruta_produccion (parte_id)
  where parte_id is not null;

-- El orden es por dueño: el mueble completo o cada parte.
drop index public.pasos_ruta_produccion_orden_key;
create unique index pasos_ruta_produccion_orden_key on public.pasos_ruta_produccion (
  planeacion_item_id, coalesce(parte_id, '00000000-0000-0000-0000-000000000000'::uuid), orden
) where retirado_en is null;

alter table public.partes_despiece add column ruta_guardada_en timestamptz;

-- 2. Datos: de la ruta del mueble a la ruta de cada parte -------------------------------------
do $$
declare
  v_item record;
  v_parte record;
  v_paso record;
  v_corte integer;
  v_n integer;
  v_nuevo uuid;
begin
  for v_item in
    select distinct pd.planeacion_item_id as id
    from public.partes_despiece pd
    join public.rutas_produccion r on r.planeacion_item_id = pd.planeacion_item_id
    where pd.retirada_en is null
  loop
    -- Lo que estaba antes del Ensamble era de las partes; sin Ensamble, toda la ruta.
    select min(s.orden) into v_corte
      from public.pasos_ruta_produccion s
      where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.proceso = 'ensamble';

    for v_parte in
      select pd.id, pd.procesos_omitidos
      from public.partes_despiece pd
      where pd.planeacion_item_id = v_item.id and pd.retirada_en is null
      order by pd.orden
    loop
      v_n := 0;
      for v_paso in
        select s.id, s.proceso
        from public.pasos_ruta_produccion s
        where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.parte_id is null
          and (
            ((v_corte is null or s.orden < v_corte) and not (s.proceso = any (v_parte.procesos_omitidos)))
            or exists (
              select 1 from public.asignaciones_produccion a
              where a.paso_id = s.id and a.parte_id = v_parte.id
            )
          )
        order by s.orden
      loop
        v_n := v_n + 1;
        insert into public.pasos_ruta_produccion (planeacion_item_id, parte_id, orden, proceso)
        values (v_item.id, v_parte.id, v_n, v_paso.proceso)
        returning id into v_nuevo;
        update public.asignaciones_produccion
          set paso_id = v_nuevo
          where paso_id = v_paso.id and parte_id = v_parte.id;
      end loop;
      update public.partes_despiece
        set ruta_guardada_en = now(), procesos_omitidos = '{}'
        where id = v_parte.id;
    end loop;

    -- Los pasos del mueble que eran de las partes salen si ya no tienen nada del mueble.
    update public.pasos_ruta_produccion s
      set retirado_en = now()
      where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.parte_id is null
        and (v_corte is null or s.orden < v_corte)
        and not exists (select 1 from public.asignaciones_produccion a where a.paso_id = s.id)
        and not exists (
          select 1 from public.revisiones_finales_calidad r
          where r.paso_retrabajo_id = s.id or r.origen_paso_id = s.id
        );

    -- Vuelve a numerar la ruta del mueble desde 1.
    update public.pasos_ruta_produccion
      set orden = orden + 1000
      where planeacion_item_id = v_item.id and retirado_en is null and parte_id is null;
    update public.pasos_ruta_produccion s
      set orden = x.n
      from (
        select id, row_number() over (order by orden) as n
        from public.pasos_ruta_produccion
        where planeacion_item_id = v_item.id and retirado_en is null and parte_id is null
      ) x
      where s.id = x.id;
  end loop;
end;
$$;

-- 3. Sin Ensamble ------------------------------------------------------------------------------
update public.pasos_ruta_produccion set proceso = 'armado' where proceso = 'ensamble';

alter table public.asignaciones_produccion drop constraint asignaciones_produccion_proceso_check;
alter table public.asignaciones_produccion add constraint asignaciones_produccion_proceso_check
  check (proceso = any (array['armado', 'barniz', 'electrificacion', 'superficie_solida']));

alter table public.pasos_ruta_produccion drop constraint pasos_ruta_produccion_proceso_check;
alter table public.pasos_ruta_produccion add constraint pasos_ruta_produccion_proceso_check
  check (proceso = any (array['armado', 'barniz', 'electrificacion', 'superficie_solida']));

create or replace function public.ruta_sugerida_produccion(p_item_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array['armado']
    || case when public.admite_superficie_solida(p_item_id) then array['superficie_solida'] else '{}'::text[] end
    || array['barniz']
    || case when public.admite_electrificacion(p_item_id) then array['electrificacion'] else '{}'::text[] end;
$$;

-- El retrabajo de Calidad vuelve a pedir que el equipo haga el proceso, sin equipo_hace.
do $$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef('public.crear_retrabajo_produccion'::regproc) into v_def;
  v_nueva := replace(v_def, 'public.equipo_hace(v_equipo.procesos, v_r.proceso)', 'v_r.proceso = any(v_equipo.procesos)');
  if v_nueva = v_def then
    raise exception 'crear_retrabajo_produccion no trae equipo_hace.';
  end if;
  execute v_nueva;
end;
$$;

-- 4. La ruta de cada dueño -----------------------------------------------------------------------
-- En qué vez va un paso de su proceso dentro de su dueño (el 2º Armado de la Tabla = 2).
create or replace function public.vez_paso_ruta(p_paso_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.pasos_ruta_produccion s
  join public.pasos_ruta_produccion x
    on x.planeacion_item_id = s.planeacion_item_id
   and x.parte_id is not distinct from s.parte_id
   and x.proceso = s.proceso
   and x.retirado_en is null
   and x.orden <= s.orden
  where s.id = p_paso_id;
$$;

revoke execute on function public.vez_paso_ruta(uuid) from public, anon;
grant execute on function public.vez_paso_ruta(uuid) to authenticated;

-- Crea lo que falte: la ruta del mueble (vacía si tiene partes) y la sugerida de cada
-- parte que nunca guardó la suya.
create or replace function public.asegurar_ruta_produccion(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parte record;
begin
  insert into public.rutas_produccion (planeacion_item_id)
  values (p_item_id)
  on conflict (planeacion_item_id) do nothing;
  if found and not exists (
    select 1 from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
  ) then
    insert into public.pasos_ruta_produccion (planeacion_item_id, orden, proceso)
    select p_item_id, s.n, s.proceso
    from unnest(public.ruta_sugerida_produccion(p_item_id)) with ordinality as s(proceso, n);
  end if;

  for v_parte in
    select pd.id from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null and pd.ruta_guardada_en is null
    for update
  loop
    insert into public.pasos_ruta_produccion (planeacion_item_id, parte_id, orden, proceso)
    select p_item_id, v_parte.id, s.n, s.proceso
    from unnest(public.ruta_sugerida_produccion(p_item_id)) with ordinality as s(proceso, n);
    update public.partes_despiece set ruta_guardada_en = now() where id = v_parte.id;
  end loop;
end;
$$;

-- Muebles completos que alcanzan las partes: la parte más atrasada en el último paso de
-- su ruta. p_por_paso: {"<paso_id>": piezas}. null si ninguna parte tiene ruta.
create or replace function public.muebles_por_partes(p_item_id uuid, p_por_paso jsonb)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select trunc(min(coalesce((p_por_paso ->> u.paso_id::text)::numeric, 0) / u.piezas_por_mueble), 2)
  from (
    select pd.piezas_por_mueble,
      (select s.id from public.pasos_ruta_produccion s
       where s.parte_id = pd.id and s.retirado_en is null
       order by s.orden desc limit 1) as paso_id
    from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
  ) u
  where u.paso_id is not null;
$$;

revoke execute on function public.muebles_por_partes(uuid, jsonb) from public, anon;
grant execute on function public.muebles_por_partes(uuid, jsonb) to authenticated;

-- Cobro de los pasos de las partes: por proceso y vez, lo de la parte más atrasada entre
-- las que llevan ese proceso esa vez. p_por_parte: {"<parte_id>": piezas}.
create or replace function public.cobertura_partes_vez(
  p_item_id uuid, p_por_parte jsonb, p_proceso text, p_vez integer
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(trunc(min(coalesce((p_por_parte ->> pd.id::text)::numeric, 0) / pd.piezas_por_mueble), 2), 0)
  from public.partes_despiece pd
  where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
    and (
      select count(*) from public.pasos_ruta_produccion s
      where s.parte_id = pd.id and s.retirado_en is null and s.proceso = p_proceso
    ) >= p_vez;
$$;

revoke execute on function public.cobertura_partes_vez(uuid, jsonb, text, integer) from public, anon;
grant execute on function public.cobertura_partes_vez(uuid, jsonb, text, integer) to authenticated;

-- Ya no hay procesos omitidos: cada parte arma su ruta con guardar_ruta_produccion.
create or replace function public.guardar_procesos_parte(p_parte_id uuid, p_omitidos text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Esta opción ya no se usa: cada parte tiene su propia ruta. Recarga la página.';
end;
$$;

-- 5. Asignar: en un paso de la ruta del mueble completo o de la parte ------------------------
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
  v_tope numeric;
  v_ya numeric;
  v_listo numeric;
  v_partes jsonb;
  v_adelantada boolean := false;
  v_encargado text := nullif(btrim(coalesce(p_encargado, '')), '');
  v_dueno text;
  v_unidad text;
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
  if p_proceso = 'electrificacion'
     and not public.admite_electrificacion(v_item.id) then
    raise exception 'El ítem % no lleva electrificación ni iluminación; no se asigna a Electrificación.', v_item.item_code;
  end if;
  if p_proceso = 'superficie_solida'
     and not public.admite_superficie_solida(v_item.id) then
    raise exception 'El ítem % no lleva superficie sólida; no se asigna a Superficie Sólida.', v_item.item_code;
  end if;

  -- Con componentes en el PM, primero el despiece (despiece_porcentaje_obligatorio).
  if public.requiere_despiece(v_item.id) then
    raise exception 'El ítem % tiene componentes: guarda su despiece antes de asignarlo.', v_item.item_code;
  end if;

  if p_parte_id is not null then
    select pd.id, pd.descripcion, pd.piezas_por_mueble, pd.unidad into v_parte
      from public.partes_despiece pd
      where pd.id = p_parte_id and pd.planeacion_item_id = v_item.id and pd.retirada_en is null;
    if not found then
      raise exception 'Esa parte ya no está en el despiece del ítem %; recarga la página.', v_item.item_code;
    end if;
    v_dueno := format('"%s"', v_parte.descripcion);
    -- Tope por paso: una parte va en sus piezas; el mueble completo, en muebles.
    v_tope := v_item.cantidad_total * v_parte.piezas_por_mueble;
    v_unidad := coalesce(v_parte.unidad, v_item.unidad);
  else
    v_dueno := 'el mueble completo';
    v_tope := v_item.cantidad_total;
    v_unidad := v_item.unidad;
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (p_proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, p_proceso;
  end if;

  perform public.asegurar_ruta_produccion(v_item.id);
  if p_paso_id is not null then
    select s.id, s.orden, s.proceso, s.parte_id into v_paso
      from public.pasos_ruta_produccion s
      where s.id = p_paso_id and s.planeacion_item_id = v_item.id and s.retirado_en is null;
    if not found then
      raise exception 'Ese paso ya no está en la ruta del ítem %; recarga la página.', v_item.item_code;
    end if;
    if v_paso.parte_id is distinct from p_parte_id then
      raise exception 'Ese paso no es de la ruta de %; recarga la página.', v_dueno;
    end if;
    if v_paso.proceso <> p_proceso then
      raise exception 'El paso % de la ruta es de %, no de %.', v_paso.orden, v_paso.proceso, p_proceso;
    end if;
  else
    -- El primer paso de ese proceso en la ruta del dueño que todavía tiene lugar.
    select s.id, s.orden, s.proceso, s.parte_id into v_paso
      from public.pasos_ruta_produccion s
      where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.proceso = p_proceso
        and s.parte_id is not distinct from p_parte_id
        and (
          select coalesce(sum(a.cantidad), 0)
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
          and s.parte_id is not distinct from p_parte_id
      ) then
        raise exception 'Ya está asignado todo % del ítem % en %.', v_dueno, v_item.item_code, p_proceso;
      end if;
      raise exception 'La ruta de % (ítem %) no lleva %; agrégalo a su ruta primero.',
        v_dueno, v_item.item_code, p_proceso;
    end if;
  end if;

  select coalesce(sum(cantidad), 0) into v_ya
    from public.asignaciones_produccion
    where paso_id = v_paso.id and cancelada_en is null and informe_rechazo_id is null
      and revision_final_rechazo_id is null;
  if v_ya + p_cantidad > v_tope then
    if p_parte_id is null then
      raise exception 'En el paso % (%) solo quedan % por asignar de % (ya asignadas: %).',
        v_paso.orden, p_proceso, v_tope - v_ya, v_tope, v_ya;
    end if;
    raise exception 'En el paso % (%), "%" solo tiene % pieza(s) por asignar de % (ya asignadas: %).',
      v_paso.orden, p_proceso, v_parte.descripcion, v_tope - v_ya, v_tope, v_ya;
  end if;

  -- Adelantada: más de lo que el paso anterior del dueño ya entregó y se verificó. El
  -- primer paso del mueble completo va detrás de sus partes (la más atrasada).
  select s.id into v_anterior
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.orden < v_paso.orden
      and s.parte_id is not distinct from p_parte_id
    order by s.orden desc
    limit 1;
  if found then
    select coalesce(sum(x.cantidad), 0) into v_listo
      from public.entregas_produccion x
      join public.asignaciones_produccion a on a.id = x.asignacion_id
      where a.paso_id = v_anterior.id and a.cancelada_en is null and a.informe_rechazo_id is null
        and a.revision_final_rechazo_id is null
        and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null;
  elsif p_parte_id is null then
    select coalesce(jsonb_object_agg(t.paso_id, t.n), '{}'::jsonb) into v_partes
      from (
        select a.paso_id, sum(x.cantidad) as n
        from public.entregas_produccion x
        join public.asignaciones_produccion a on a.id = x.asignacion_id
        where a.planeacion_item_id = v_item.id and a.parte_id is not null and a.paso_id is not null
          and a.cancelada_en is null and a.informe_rechazo_id is null
          and a.revision_final_rechazo_id is null
          and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null
        group by a.paso_id
      ) t;
    v_listo := public.muebles_por_partes(v_item.id, v_partes);
  end if;
  v_adelantada := v_listo is not null and v_ya + p_cantidad > v_listo;

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
    v_item.descripcion, v_unidad, p_equipo_id, p_proceso, p_cantidad,
    p_fecha_asignacion, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado,
    v_paso.id, v_adelantada, p_parte_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 6. Guardar la ruta del mueble completo (p_parte_id null) o de una parte -----------------------
drop function public.guardar_ruta_produccion(uuid, jsonb, integer);

create function public.guardar_ruta_produccion(
  p_item_id uuid,
  p_pasos jsonb,
  p_version_esperada integer,
  p_parte_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_parte record;
  v_version integer;
  v_paso jsonb;
  v_n integer := 0;
  v_id uuid;
  v_proceso text;
  v_existente record;
  v_ids uuid[] := '{}';
  v_quitado record;
  v_folio text;
  v_procesos text[] := '{}';
  v_etiqueta text;
  v_con_asignaciones uuid[];
  v_orden_nuevo uuid[];
  v_tiene_partes boolean;
  v_nombre_parte text;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede cambiar la ruta.';
  end if;
  if p_version_esperada is null or p_version_esperada < 0 then
    raise exception 'Falta la versión de la ruta que tenías abierta.';
  end if;

  select pi.id, pi.item_code, pi.modelo, pi.tipo_registro, pi.estado_liberacion,
         pi.eliminacion_solicitada_en, pi.estado_revision, pv.es_version_activa,
         p.numero_pedido, p.eliminado_en, p.cancelado_en
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
    raise exception 'La ruta es de los muebles (ítems padre), no de sus componentes.';
  end if;
  if not v_item.es_version_activa then
    raise exception 'El ítem es de una versión anterior del PM; cambia la ruta desde la versión activa.';
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

  if p_parte_id is not null then
    select pd.id, pd.descripcion into v_parte
      from public.partes_despiece pd
      where pd.id = p_parte_id and pd.planeacion_item_id = p_item_id and pd.retirada_en is null
      for update;
    if not found then
      raise exception 'Esa parte ya no está en el despiece del ítem %; recarga la página.', v_item.item_code;
    end if;
    v_nombre_parte := v_parte.descripcion;
  end if;
  v_tiene_partes := exists (
    select 1 from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
  );

  -- Una versión por mueble: cubre su ruta y las de sus partes.
  select version into v_version
    from public.rutas_produccion where planeacion_item_id = p_item_id
    for update;
  if coalesce(v_version, 0) <> p_version_esperada then
    raise exception 'Alguien más cambió la ruta de este mueble mientras la editabas. Recarga la página y vuelve a hacer tus cambios.';
  end if;

  if p_pasos is null or jsonb_typeof(p_pasos) <> 'array' then
    raise exception 'Formato de ruta no válido.';
  end if;
  -- Una parte puede no llevar procesos; el mueble completo, solo si tiene partes.
  if jsonb_array_length(p_pasos) = 0 and p_parte_id is null and not v_tiene_partes then
    raise exception 'La ruta necesita al menos un paso.';
  end if;
  if jsonb_array_length(p_pasos) > 12 then
    raise exception 'La ruta no puede pasar de 12 pasos.';
  end if;

  if v_version is null then
    insert into public.rutas_produccion (planeacion_item_id, version)
    values (p_item_id, 0);
    -- Sin partes, el único dueño es el mueble y su ruta es la que llega.
  end if;
  if p_parte_id is not null then
    update public.partes_despiece set ruta_guardada_en = now() where id = p_parte_id;
  end if;
  -- Las demás partes que nunca guardaron su ruta toman la sugerida.
  perform public.asegurar_ruta_produccion(p_item_id);

  for v_paso in select value from jsonb_array_elements(p_pasos) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_paso) <> 'object' then
      raise exception 'Paso %: formato no válido.', v_n;
    end if;
    v_proceso := v_paso->>'proceso';
    if v_proceso is null
       or v_proceso not in ('armado', 'barniz', 'electrificacion', 'superficie_solida') then
      raise exception 'Paso %: proceso no válido.', v_n;
    end if;
    if nullif(v_paso->>'id', '') is not null then
      if (v_paso->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Paso %: no es válido.', v_n;
      end if;
      v_id := (v_paso->>'id')::uuid;
      if v_id = any(v_ids) then
        raise exception 'Paso %: se repite en la ruta.', v_n;
      end if;
      select s.proceso into v_existente
        from public.pasos_ruta_produccion s
        where s.id = v_id and s.planeacion_item_id = p_item_id and s.retirado_en is null
          and s.parte_id is not distinct from p_parte_id;
      if not found then
        raise exception 'Paso %: ya no está en la ruta. Recarga la página.', v_n;
      end if;
      if v_existente.proceso <> v_proceso then
        raise exception 'Paso %: un paso guardado no cambia de proceso; quítalo y agrega otro.', v_n;
      end if;
      v_ids := v_ids || v_id;
    else
      if v_proceso = 'electrificacion' and not public.admite_electrificacion(p_item_id) then
        raise exception 'El ítem % no lleva electrificación ni iluminación; no se agrega Electrificación.', v_item.item_code;
      end if;
      if v_proceso = 'superficie_solida' and not public.admite_superficie_solida(p_item_id) then
        raise exception 'El ítem % no lleva superficie sólida; no se agrega Superficie Sólida.', v_item.item_code;
      end if;
    end if;
  end loop;

  for v_quitado in
    select s.id, s.orden, s.proceso
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.retirado_en is null
      and s.parte_id is not distinct from p_parte_id
      and not (s.id = any(v_ids))
    order by s.orden
  loop
    if exists (
      select 1 from public.asignaciones_produccion a
      where a.paso_id = v_quitado.id and a.cancelada_en is null
    ) then
      raise exception 'El paso % (%) tiene asignaciones; cancélalas antes de quitarlo de la ruta.',
        v_quitado.orden, v_quitado.proceso;
    end if;
    select r.folio into v_folio
      from public.revisiones_finales_calidad r
      where r.paso_retrabajo_id = v_quitado.id and not r.aprobado
      limit 1;
    if found then
      raise exception 'La revisión final (%) regresó piezas al paso % (%) que faltan por reasignar; reasígnalas antes de quitarlo de la ruta.',
        v_folio, v_quitado.orden, v_quitado.proceso;
    end if;
    update public.pasos_ruta_produccion
      set retirado_en = now(), retirado_por = auth.uid()
      where id = v_quitado.id;
  end loop;

  -- Los pasos con asignaciones vigentes no cambian de orden entre sí (lo listo y lo
  -- adelantado de cada uno dependen de su paso anterior); los demás se mueven libres.
  select coalesce(array_agg(s.id order by s.orden), '{}') into v_con_asignaciones
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.retirado_en is null
      and s.parte_id is not distinct from p_parte_id
      and exists (
        select 1 from public.asignaciones_produccion a
        where a.paso_id = s.id and a.cancelada_en is null
      );
  select coalesce(array_agg(x.id order by x.n), '{}') into v_orden_nuevo
    from (
      select nullif(e.value->>'id', '')::uuid as id, e.n
      from jsonb_array_elements(p_pasos) with ordinality as e(value, n)
    ) x
    where x.id = any (v_con_asignaciones);
  if v_orden_nuevo <> v_con_asignaciones then
    raise exception 'Los pasos con asignaciones no cambian de orden entre sí; mueve solo los pasos sin asignar.';
  end if;

  update public.pasos_ruta_produccion
    set orden = orden + 1000
    where planeacion_item_id = p_item_id and retirado_en is null
      and parte_id is not distinct from p_parte_id;

  v_n := 0;
  for v_paso in select value from jsonb_array_elements(p_pasos) loop
    v_n := v_n + 1;
    v_proceso := v_paso->>'proceso';
    v_procesos := v_procesos || v_proceso;
    if nullif(v_paso->>'id', '') is not null then
      update public.pasos_ruta_produccion set orden = v_n where id = (v_paso->>'id')::uuid;
    else
      insert into public.pasos_ruta_produccion (planeacion_item_id, parte_id, orden, proceso)
      values (p_item_id, p_parte_id, v_n, v_proceso);
    end if;
  end loop;

  update public.rutas_produccion
    set version = version + 1, actualizado_por = auth.uid(), actualizado_en = now()
    where planeacion_item_id = p_item_id
    returning version into v_version;

  select string_agg(
           case x.proceso
             when 'armado' then 'Armado'
             when 'barniz' then 'Barniz'
             when 'electrificacion' then 'Electrificación'
             else 'Superficie Sólida'
           end, ' → ' order by x.n)
    into v_etiqueta
    from unnest(v_procesos) with ordinality as x(proceso, n);

  insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
  values (auth.uid(), 'rutas_produccion', p_item_id, 'ruta_guardada',
          jsonb_build_object(
            'numero_pedido', v_item.numero_pedido, 'item_code', v_item.item_code,
            'modelo', v_item.modelo, 'parte', v_nombre_parte,
            'ruta', coalesce(v_etiqueta, '(sin pasos)'), 'version', v_version
          ));

  return v_version;
end;
$$;

revoke execute on function public.guardar_ruta_produccion(uuid, jsonb, integer, uuid) from public, anon;
grant execute on function public.guardar_ruta_produccion(uuid, jsonb, integer, uuid) to authenticated;

-- 7. Revisión final ------------------------------------------------------------------------------
-- Listas: con pasos del mueble completo, lo de su último paso; sin ellos, lo que alcanza la
-- parte más atrasada en el último paso de su ruta (muebles_por_partes).
create or replace function public.piezas_listas_revision_final(p_item_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  -- Ya no usa procesos_omitidos: cada parte tiene su propia ruta.
  with ultimo as (
    select s.id from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.retirado_en is null and s.parte_id is null
    order by s.orden desc limit 1
  ),
  l as (
    select a.parte_id, a.paso_id, l.cantidad - l.rechazadas as n
    from public.lotes_calidad l
    join public.asignaciones_produccion a on a.id = l.asignacion_id
    where a.planeacion_item_id = p_item_id and a.cancelada_en is null and l.vigente
  )
  select case
    when exists (select 1 from ultimo) then
      (select coalesce(sum(n), 0) from l where parte_id is null and paso_id = (select id from ultimo))
    else coalesce(public.muebles_por_partes(p_item_id, (
      select jsonb_object_agg(t.paso_id, t.n)
      from (
        select paso_id, sum(n) as n from l
        where parte_id is not null and paso_id is not null
        group by paso_id
      ) t
    )), 0)
  end;
$$;

-- El siguiente paso del retrabajo de un rechazo: desde el paso al que regresó, el resto de
-- su ruta (si es de una parte, en sus piezas) y luego la del mueble completo.
-- objetivo: lo que hay que reasignar en ese paso (las piezas de la parte o los muebles).
drop view public.rechazos_revision_final;
drop function public.siguiente_paso_revision_final(uuid);

create function public.siguiente_paso_revision_final(p_revision_id uuid)
returns table (
  paso_id uuid, orden integer, proceso text, reasignado numeric, listo numeric,
  parte_id uuid, objetivo numeric
)
language sql
stable
set search_path = ''
as $$
  with r as (
    select x.id, x.cantidad, x.planeacion_item_id, s.orden as desde, s.parte_id as desde_parte
    from public.revisiones_finales_calidad x
    join public.pasos_ruta_produccion s on s.id = x.paso_retrabajo_id and s.retirado_en is null
    where x.id = p_revision_id and not x.aprobado
  ),
  seq as (
    select s.id, s.orden, s.proceso, s.parte_id,
      case when s.parte_id is null then 1 else 0 end as grupo,
      r.cantidad * coalesce(pd.piezas_por_mueble, 1) as objetivo,
      coalesce(pd.piezas_por_mueble, 1) as ppm
    from r
    join public.pasos_ruta_produccion s
      on s.planeacion_item_id = r.planeacion_item_id and s.retirado_en is null
    left join public.partes_despiece pd on pd.id = s.parte_id
    where (r.desde_parte is not null and s.parte_id = r.desde_parte and s.orden >= r.desde)
       or (s.parte_id is null and (r.desde_parte is not null or s.orden >= r.desde))
  ),
  pasos as (
    select q.*,
      lag(q.id) over (order by q.grupo, q.orden) as anterior,
      lag(q.ppm) over (order by q.grupo, q.orden) as ppm_anterior,
      coalesce((
        select sum(a.cantidad) from public.asignaciones_produccion a
        where a.revision_final_rechazo_id = p_revision_id and a.paso_id = q.id
          and a.cancelada_en is null and a.informe_rechazo_id is null
      ), 0) as reasignado
    from seq q
  )
  select p.id, p.orden, p.proceso, p.reasignado,
         case when p.anterior is null then p.objetivo
              else trunc(coalesce((
                select sum(e.cantidad)
                from public.asignaciones_produccion a
                join public.entregas_produccion e on e.asignacion_id = a.id
                where a.revision_final_rechazo_id = p_revision_id and a.paso_id = p.anterior
                  and a.cancelada_en is null and a.informe_rechazo_id is null
                  and e.anulada_en is null and e.rechazada_en is null and e.verificada_en is not null
              ), 0) / p.ppm_anterior * p.ppm, 2)
         end,
         p.parte_id, p.objetivo
  from pasos p
  where p.reasignado < p.objetivo
  order by p.grupo, p.orden
  limit 1;
$$;

revoke execute on function public.siguiente_paso_revision_final(uuid) from public, anon;
grant execute on function public.siguiente_paso_revision_final(uuid) to authenticated;

create view public.rechazos_revision_final with (security_invoker = true) as
select r.id as revision_id,
  r.folio,
  r.elaborado_en,
  r.motivo,
  r.categoria,
  r.cantidad,
  r.planeacion_item_id,
  pv.pedido_id,
  p.numero_pedido,
  pi.item_code,
  pi.modelo,
  pi.descripcion,
  pi.unidad,
  s.id as paso_id,
  s.orden as paso_orden,
  s.proceso,
  (s.retirado_en is not null) as paso_retirado,
  case when s.retirado_en is null then coalesce(sg.reasignado, sg.objetivo, r.cantidad)
       else coalesce(ro.reasignado, 0) end as reasignado,
  case when s.retirado_en is null then coalesce(sg.objetivo - sg.reasignado, 0)
       else r.cantidad - coalesce(ro.reasignado, 0) end as por_reasignar,
  (pv.es_version_activa and pi.estado_revision is distinct from 'cancelado'
    and pi.eliminacion_solicitada_en is null and p.eliminado_en is null
    and p.eliminado_definitivo_en is null and p.cancelado_en is null) as vigente,
  sg.paso_id as siguiente_paso_id,
  sg.orden as siguiente_paso_orden,
  sg.proceso as siguiente_proceso,
  greatest(0, coalesce(sg.listo - sg.reasignado, 0)) as listo_siguiente,
  sg.parte_id as siguiente_parte_id,
  pds.descripcion as siguiente_parte,
  pds.unidad as siguiente_parte_unidad
from public.revisiones_finales_calidad r
join public.planeacion_items pi on pi.id = r.planeacion_item_id
join public.pedido_versiones pv on pv.id = pi.pedido_version_id
join public.pedidos p on p.id = pv.pedido_id
join public.pasos_ruta_produccion s on s.id = r.paso_retrabajo_id
left join lateral public.siguiente_paso_revision_final(r.id)
  sg(paso_id, orden, proceso, reasignado, listo, parte_id, objetivo) on true
left join public.partes_despiece pds on pds.id = sg.parte_id
left join lateral (
  select sum(a.cantidad) as reasignado
  from public.asignaciones_produccion a
  where a.revision_final_rechazo_id = r.id and a.paso_id = s.id
    and a.cancelada_en is null and a.informe_rechazo_id is null
) ro on true
where not r.aprobado;

grant select on public.rechazos_revision_final to authenticated;

create or replace function public.crear_retrabajo_revision_final(
  p_revision_id uuid,
  p_equipo_id uuid,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text,
  p_encargado text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
  v_sig record;
  v_equipo record;
  v_unidad text;
  v_encargado text := nullif(btrim(coalesce(p_encargado, '')), '');
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede reasignar retrabajos.';
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

  select r.aprobado, r.cantidad, r.folio, s.retirado_en as paso_retirado_en,
         pi.id as item_id, pi.item_code, pi.modelo, pi.descripcion, pi.unidad,
         pi.estado_revision, pi.eliminacion_solicitada_en,
         p.id as pedido_id, p.numero_pedido, p.eliminado_en, p.cancelado_en
    into v_r
    from public.revisiones_finales_calidad r
    join public.pasos_ruta_produccion s on s.id = r.paso_retrabajo_id
    join public.planeacion_items pi on pi.id = r.planeacion_item_id
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    join public.pedidos p on p.id = pv.pedido_id
    where r.id = p_revision_id
    for update of r;
  if not found then
    raise exception 'La revisión final no existe o no tiene rechazo.';
  end if;
  if v_r.aprobado then
    raise exception 'La revisión % está aprobada; no hay nada que retrabajar.', v_r.folio;
  end if;
  if v_r.estado_revision = 'cancelado'
     or v_r.eliminacion_solicitada_en is not null
     or v_r.eliminado_en is not null
     or v_r.cancelado_en is not null then
    raise exception 'El mueble o su PM está cancelado o eliminado.';
  end if;
  if v_r.paso_retirado_en is not null then
    raise exception 'El paso al que regresaba ya no está en la ruta del mueble.';
  end if;

  select * into v_sig from public.siguiente_paso_revision_final(p_revision_id);
  if not found then
    raise exception 'Del folio % ya se reasignó todo en todos los pasos de la ruta.', v_r.folio;
  end if;
  if v_sig.reasignado + p_cantidad > v_sig.objetivo then
    raise exception 'Del folio % solo quedan % por reasignar en el paso % (%).',
      v_r.folio, v_sig.objetivo - v_sig.reasignado, v_sig.orden, v_sig.proceso;
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (v_sig.proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, v_sig.proceso;
  end if;

  v_unidad := v_r.unidad;
  if v_sig.parte_id is not null then
    select coalesce(pd.unidad, v_r.unidad) into v_unidad
      from public.partes_despiece pd where pd.id = v_sig.parte_id;
  end if;

  if v_encargado is not null then
    insert into public.encargados_equipo_produccion (equipo_id, nombre)
    values (p_equipo_id, v_encargado)
    on conflict (equipo_id, lower(btrim(nombre))) do nothing;
  end if;

  insert into public.asignaciones_produccion (
    planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad,
    equipo_id, proceso, cantidad, fecha_asignacion, notas, creado_por, encargado,
    paso_id, revision_final_rechazo_id, adelantada, parte_id
  ) values (
    v_r.item_id, v_r.pedido_id, v_r.numero_pedido, v_r.item_code, v_r.modelo, v_r.descripcion,
    v_unidad, p_equipo_id, v_sig.proceso, p_cantidad, p_fecha_asignacion,
    nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado,
    v_sig.paso_id, p_revision_id, v_sig.reasignado + p_cantidad > v_sig.listo, v_sig.parte_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 8. Qué vez de su proceso es cada paso, dentro de su dueño (resumen y lotes de Calidad) --------
do $$
declare
  v_vista text;
  v_def text;
  v_nueva text;
begin
  foreach v_vista in array array['asignaciones_produccion_resumen', 'lotes_calidad'] loop
    v_def := pg_get_viewdef(('public.' || v_vista)::regclass);
    v_nueva := replace(v_def, '(s2.proceso = s.proceso)',
      '(s2.proceso = s.proceso) AND (NOT (s2.parte_id IS DISTINCT FROM s.parte_id))');
    if v_nueva = v_def then
      raise exception 'La vista % no trae la cuenta de veces esperada.', v_vista;
    end if;
    execute format('create or replace view public.%I with (security_invoker = true) as %s', v_vista, v_nueva);
  end loop;
end;
$$;

-- 9. Estimaciones -------------------------------------------------------------------------------
-- Un proceso se cobra una vez por paso del mueble más las veces de la parte que más lo lleva.
create or replace function public.veces_proceso_ruta(p_item_id uuid, p_area text)
returns integer
language sql
stable
set search_path = ''
as $$
  with pasos as (
    select s.parte_id
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id
      and s.retirado_en is null
      and s.proceso = case p_area when 'armado' then 'armado' when 'acabados' then 'barniz' end
  )
  select greatest(1, (
    (select count(*) from pasos where parte_id is null)
    + coalesce((select max(n) from (select count(*) as n from pasos where parte_id is not null group by parte_id) t), 0)
  )::integer);
$$;

create or replace function public.verificado_produccion_variante(p_ot text default null)
returns table (ot text, clave text, vclave text, componente boolean, verificado_acabados numeric, verificado_armado numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with padres as (
    select pi.id, pi.cantidad_total,
      public.ot_clave(p.numero_pedido) as ot,
      public.norm_modelo(pi.modelo) as clave,
      public.norm_descripcion(pi.descripcion) as vclave,
      (pi.estado_revision is not distinct from 'cancelado' or pi.eliminacion_solicitada_en is not null) as fuera,
      l.acabados,
      l.armado
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    -- Entregas verificadas (lotes_calidad = verificadas, sin anular ni rechazar)
    -- de equipos que no son de planta. Sin retrabajos. Un paso del mueble completo
    -- cuenta lo suyo; los de las partes, por proceso y vez, lo de la parte más atrasada.
    cross join lateral (
      select coalesce(sum(pp.n) filter (where pp.proceso = 'barniz'), 0) as acabados,
             coalesce(sum(pp.n) filter (where pp.proceso = 'armado'), 0) as armado
      from (
        select x.proceso,
          case when x.vez is null then sum(x.n)
               else public.cobertura_partes_vez(pi.id, jsonb_object_agg(x.parte_id, x.n) filter (where x.parte_id is not null), x.proceso, x.vez)
          end as n
        from (
          select lc.proceso, la.parte_id,
            case when la.parte_id is null then la.paso_id end as paso_mueble,
            case when la.parte_id is not null then public.vez_paso_ruta(la.paso_id) end as vez,
            sum(lc.cantidad) as n
          from public.lotes_calidad lc
          join public.equipos_produccion q on q.id = lc.equipo_id
          join public.asignaciones_produccion la on la.id = lc.asignacion_id
          where lc.planeacion_item_id = pi.id and lc.vigente and not q.es_planta
            and la.informe_rechazo_id is null and la.revision_final_rechazo_id is null
          group by 1, 2, 3, 4
        ) x
        -- Un grupo por paso del mueble o, en las partes, por (x.vez, x.proceso).
        group by x.proceso, x.paso_mueble, x.vez
      ) pp
    ) l
    where pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and exists (
        select 1 from public.asignaciones_produccion a
        where a.planeacion_item_id = pi.id and a.cancelada_en is null
      )
      and (p_ot is null or public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot))
  )
  select x.ot, x.clave, x.vclave, false, sum(x.acabados), sum(x.armado)
  from padres x
  group by 1, 2, 3
  union all
  -- Componentes: la proporción de su mueble que Producción ya verificó (una vez).
  select x.ot, public.norm_modelo(h.modelo), public.norm_descripcion(h.descripcion), true,
    sum(floor(h.cantidad_total * least(x.acabados, x.cantidad_total) / x.cantidad_total)),
    sum(floor(h.cantidad_total * least(x.armado, x.cantidad_total) / x.cantidad_total))
  from public.planeacion_items h
  join padres x on x.id = h.parent_item_id and not x.fuera and x.cantidad_total > 0
  where h.tipo_registro = 'FU'
    and (h.estado_revision is null or h.estado_revision <> 'cancelado')
    and h.eliminacion_solicitada_en is null
  group by 1, 2, 3;
$$;

create or replace function public.aprobado_calidad_variante(p_ot text default null)
returns table (ot text, clave text, vclave text, componente boolean, aprobado_acabados numeric, aprobado_armado numeric)
language sql
stable
security definer
set search_path = ''
as $$
  -- Muebles padre asignados a algún equipo. Lotes: piezas aprobadas por Calidad en
  -- lotes de equipos que no son de planta (la planta no cobra recibo); el barniz se
  -- cobra como Acabados; lo que regresó la revisión final ya se aprobó una vez y sus
  -- lotes no cuentan; un paso del mueble completo cuenta lo suyo y los de las partes,
  -- por proceso y vez, lo de la parte más atrasada.
  -- Revisión final: lo aprobado ahí, sin pasar de lo que Producción verificó de esos
  -- equipos en el proceso (mismas reglas que verificado_produccion_variante).
  with padres as (
    select pi.id, pi.cantidad_total,
      public.ot_clave(p.numero_pedido) as ot,
      public.norm_modelo(pi.modelo) as clave,
      public.norm_descripcion(pi.descripcion) as vclave,
      (pi.estado_revision is not distinct from 'cancelado' or pi.eliminacion_solicitada_en is not null) as fuera,
      greatest(l.acabados_lotes, least(l.acabados_verif, coalesce(rf.aprobadas, 0))) as acabados,
      greatest(l.armado_lotes, least(l.armado_verif, coalesce(rf.aprobadas, 0))) as armado
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    cross join lateral (
      select coalesce(sum(pp.aprob) filter (where pp.proceso = 'barniz'), 0) as acabados_lotes,
             coalesce(sum(pp.aprob) filter (where pp.proceso = 'armado'), 0) as armado_lotes,
             coalesce(sum(pp.verif) filter (where pp.proceso = 'barniz'), 0) as acabados_verif,
             coalesce(sum(pp.verif) filter (where pp.proceso = 'armado'), 0) as armado_verif
      from (
        select x.proceso,
          case when x.vez is null then sum(x.aprob)
               else public.cobertura_partes_vez(pi.id, jsonb_object_agg(x.parte_id, x.aprob) filter (where x.parte_id is not null), x.proceso, x.vez)
          end as aprob,
          case when x.vez is null then sum(x.verif)
               else public.cobertura_partes_vez(pi.id, jsonb_object_agg(x.parte_id, x.verif) filter (where x.parte_id is not null), x.proceso, x.vez)
          end as verif
        from (
          select lc.proceso, la.parte_id,
            case when la.parte_id is null then la.paso_id end as paso_mueble,
            case when la.parte_id is not null then public.vez_paso_ruta(la.paso_id) end as vez,
            sum(lc.aprobadas) as aprob,
            coalesce(sum(lc.cantidad) filter (where la.informe_rechazo_id is null), 0) as verif
          from public.lotes_calidad lc
          join public.equipos_produccion q on q.id = lc.equipo_id
          join public.asignaciones_produccion la on la.id = lc.asignacion_id
          where lc.planeacion_item_id = pi.id and lc.vigente and not q.es_planta
            and la.revision_final_rechazo_id is null
          group by 1, 2, 3, 4
        ) x
        -- Un grupo por paso del mueble o, en las partes, por (x.vez, x.proceso).
        group by x.proceso, x.paso_mueble, x.vez
      ) pp
    ) l
    left join lateral (
      select sum(r.cantidad) filter (where r.aprobado) as aprobadas
      from public.revisiones_finales_calidad r
      where r.planeacion_item_id = pi.id
    ) rf on true
    where pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and exists (
        select 1 from public.asignaciones_produccion a
        where a.planeacion_item_id = pi.id and a.cancelada_en is null
      )
      and (p_ot is null or public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot))
  )
  select x.ot, x.clave, x.vclave, false, sum(x.acabados), sum(x.armado)
  from padres x
  group by 1, 2, 3
  union all
  -- Componentes (hijos) de un mueble asignado: Calidad los aprueba enteros (vale su
  -- último informe) o con su mueble en la revisión final (la proporción de su mueble).
  select x.ot, public.norm_modelo(h.modelo), public.norm_descripcion(h.descripcion), true,
    sum(greatest(
      case when u.aprobado then h.cantidad_total else 0 end,
      case when x.cantidad_total > 0
        then floor(h.cantidad_total * least(x.acabados, x.cantidad_total) / x.cantidad_total) else 0 end)),
    sum(greatest(
      case when u.aprobado then h.cantidad_total else 0 end,
      case when x.cantidad_total > 0
        then floor(h.cantidad_total * least(x.armado, x.cantidad_total) / x.cantidad_total) else 0 end))
  from public.planeacion_items h
  join padres x on x.id = h.parent_item_id and not x.fuera
  left join lateral (
    select ic.aprobado
    from public.informes_calidad ic
    where ic.planeacion_item_id = h.id
    order by ic.elaborado_en desc, ic.id desc
    limit 1
  ) u on true
  where h.tipo_registro = 'FU'
    and (h.estado_revision is null or h.estado_revision <> 'cancelado')
    and h.eliminacion_solicitada_en is null
  group by 1, 2, 3;
$$;

-- Recibos por llegar: las partes que llevan el proceso en su ruta (o que aún usan la
-- sugerida, sin ruta guardada) y las veces como en veces_proceso_ruta.
create or replace function public.muebles_en_calidad()
returns table (
  ot text, planeacion_item_id uuid, item_code text, modelo text, descripcion text,
  cantidad numeric, proceso text, parte_id uuid, parte text, piezas_por_mueble numeric,
  entregadas numeric, aprobadas numeric, veces integer, final_aprobadas numeric
)
language sql
stable
set search_path = ''
as $$
  with lotes as (
    select lc.planeacion_item_id as item_id, lc.proceso, la.parte_id,
      coalesce(sum(lc.cantidad) filter (where la.informe_rechazo_id is null), 0) as entregadas,
      sum(lc.aprobadas) as aprobadas
    from public.lotes_calidad lc
    join public.equipos_produccion q on q.id = lc.equipo_id
    join public.asignaciones_produccion la on la.id = lc.asignacion_id
    where lc.vigente and not q.es_planta and la.revision_final_rechazo_id is null
      and lc.proceso in ('barniz', 'armado')
    group by 1, 2, 3
  ),
  muebles as (
    select distinct item_id, proceso from lotes where entregadas > 0
  )
  select public.ot_clave(p.numero_pedido), pi.id, pi.item_code, pi.modelo, pi.descripcion,
    pi.cantidad_total, m.proceso, x.parte_id, x.parte, x.piezas_por_mueble,
    coalesce(l.entregadas, 0), coalesce(l.aprobadas, 0),
    greatest(1, (
      (select count(*) from public.pasos_ruta_produccion s
       where s.planeacion_item_id = pi.id and s.parte_id is null and s.proceso = m.proceso
         and s.retirado_en is null)
      + coalesce((
          select max(t.n) from (
            select count(*) as n from public.pasos_ruta_produccion s
            where s.planeacion_item_id = pi.id and s.parte_id is not null and s.proceso = m.proceso
              and s.retirado_en is null
            group by s.parte_id
          ) t), 0)
    ))::integer,
    coalesce(rf.aprobadas, 0)
  from muebles m
  join public.planeacion_items pi on pi.id = m.item_id
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
  -- Sus partes que llevan el proceso y, si tiene lotes del mueble completo o no tiene
  -- despiece, una fila del mueble completo.
  cross join lateral (
    select pd.id as parte_id, pd.descripcion as parte, pd.piezas_por_mueble, pd.orden
    from public.partes_despiece pd
    where pd.planeacion_item_id = pi.id and pd.retirada_en is null
      and (
        pd.ruta_guardada_en is null
        or exists (
          select 1 from public.pasos_ruta_produccion s
          where s.parte_id = pd.id and s.retirado_en is null and s.proceso = m.proceso
        )
      )
    union all
    select null::uuid, null::text, 1::numeric, -1
    where exists (
        select 1 from lotes l2
        where l2.item_id = m.item_id and l2.proceso = m.proceso and l2.parte_id is null
      )
      or not exists (
        select 1 from public.partes_despiece pd
        where pd.planeacion_item_id = pi.id and pd.retirada_en is null
      )
  ) x
  left join lotes l on l.item_id = m.item_id and l.proceso = m.proceso
    and l.parte_id is not distinct from x.parte_id
  left join lateral (
    select sum(r.cantidad) filter (where r.aprobado) as aprobadas
    from public.revisiones_finales_calidad r
    where r.planeacion_item_id = pi.id
  ) rf on true
  where pi.tipo_registro = 'MO' and pi.parent_item_id is null
  order by 1, pi.item_code, m.proceso, x.orden;
$$;

-- 10. Lo que ya no se usa ---------------------------------------------------------------------
drop function public.cobertura_por_partes(uuid, numeric, jsonb, text);
drop function public.admite_ensamble(uuid);
drop function public.equipo_hace(text[], text);

notify pgrst, 'reload schema';
