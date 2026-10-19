-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.rutas_produccion
-- @verifica table public.pasos_ruta_produccion
-- @verifica policy public.rutas_produccion.select_rutas_produccion
-- @verifica policy public.pasos_ruta_produccion.select_pasos_ruta_produccion
-- @verifica column public.asignaciones_produccion.paso_id
-- @verifica column public.asignaciones_produccion.adelantada
-- @verifica column public.asignaciones_produccion_resumen.paso_id
-- @verifica column public.asignaciones_produccion_resumen.adelantada
-- @verifica function public.ruta_sugerida_produccion
-- @verifica function public.asegurar_ruta_produccion
-- @verifica function public.guardar_ruta_produccion
-- @verifica function public.paso_de_retrabajo
-- @verifica trigger public.asignaciones_produccion.trg_paso_de_retrabajo
-- @verifica function-contiene public.crear_asignacion_produccion p_paso_id
-- @verifica function-contiene public.crear_asignacion_produccion adelantada
-- @verifica index public.pasos_ruta_produccion_orden_key

-- ============================================================================
-- Producción — ruta de cada mueble.
--
-- Hasta aquí un mueble se asignaba por proceso (Armado, Barniz, Electrificación,
-- Superficie Sólida) con un tope de su cantidad POR PROCESO y sin orden: no se
-- podía armar dos veces el mismo mueble (cuerpo y armado final) ni se sabía qué
-- paso iba después.
--
--   * rutas_produccion / pasos_ruta_produccion: la ruta del mueble, una lista
--     ordenada de pasos que se pueden repetir (Armado → Barniz → Armado...). La
--     sugerida es Armado → Superficie Sólida → Barniz → Electrificación, con S.S.
--     y Electrificación solo si el mueble las lleva. El trabajador la cambia con
--     guardar_ruta_produccion (bloqueo optimista por versión).
--   * Cada asignación es de un paso (asignaciones_produccion.paso_id). El tope
--     pasa a ser POR PASO: en cada paso se asigna hasta la cantidad del mueble.
--     El retrabajo sigue sin contar contra el tope y hereda el paso de lo que
--     rechazó Calidad (trigger trg_paso_de_retrabajo).
--   * Lo que está listo para un paso es lo que el paso anterior ya entregó y
--     Producción verificó. Asignar más NO se bloquea (lo pidió el usuario: solo
--     avisar): la pantalla avisa y la asignación queda marcada como
--     `adelantada`, para que se vea después.
--   * Un paso con asignaciones vigentes no se quita de la ruta; los quitados no
--     se borran (retirado_en), así el historial cancelado conserva su paso.
--
-- Los muebles que ya tenían asignaciones reciben su ruta aquí (un paso por
-- proceso, en el orden sugerido) y cada asignación queda en su paso. Los demás
-- reciben la sugerida al guardar su ruta o con su primera asignación.
--
-- Calidad y Estimaciones no cambian: siguen leyendo el proceso de la asignación.
-- ============================================================================

-- 1. Tablas -----------------------------------------------------------------
create table public.rutas_produccion (
  planeacion_item_id uuid primary key references public.planeacion_items(id) on delete cascade,
  version integer not null default 1,
  actualizado_por uuid references auth.users(id) default auth.uid(),
  actualizado_en timestamptz not null default now()
);
create index idx_rutas_produccion_actualizado_por on public.rutas_produccion (actualizado_por);

alter table public.rutas_produccion enable row level security;
create policy "select_rutas_produccion" on public.rutas_produccion
  for select to authenticated using ((select public.is_staff()));
-- Sin políticas de escritura: solo entra por guardar_ruta_produccion y
-- crear_asignacion_produccion.

create table public.pasos_ruta_produccion (
  id uuid primary key default gen_random_uuid(),
  planeacion_item_id uuid not null
    references public.rutas_produccion(planeacion_item_id) on delete cascade,
  orden integer not null,
  proceso text not null,
  creado_por uuid references auth.users(id) default auth.uid(),
  creado_en timestamptz not null default now(),
  retirado_en timestamptz,
  retirado_por uuid references auth.users(id),
  constraint pasos_ruta_produccion_proceso_check check (
    proceso in ('armado', 'barniz', 'electrificacion', 'superficie_solida')
  ),
  constraint pasos_ruta_produccion_orden_check check (orden > 0)
);
-- Un lugar por paso vigente; los retirados conservan el que tenían.
create unique index pasos_ruta_produccion_orden_key
  on public.pasos_ruta_produccion (planeacion_item_id, orden)
  where retirado_en is null;
create index idx_pasos_ruta_produccion_creado_por on public.pasos_ruta_produccion (creado_por);
create index idx_pasos_ruta_produccion_retirado_por on public.pasos_ruta_produccion (retirado_por);

alter table public.pasos_ruta_produccion enable row level security;
create policy "select_pasos_ruta_produccion" on public.pasos_ruta_produccion
  for select to authenticated using ((select public.is_staff()));

alter table public.asignaciones_produccion
  add column paso_id uuid references public.pasos_ruta_produccion(id) on delete set null,
  -- Se asignó antes de que el paso anterior entregara (y Producción verificara)
  -- esas piezas.
  add column adelantada boolean not null default false;
create index idx_asignaciones_produccion_paso on public.asignaciones_produccion (paso_id);

-- 2. Ruta sugerida ------------------------------------------------------------
-- Armado → Superficie Sólida → Barniz → Electrificación; S.S. y Electrificación
-- solo si el mueble o sus componentes las llevan. Espejo en
-- src/lib/produccion/ruta.ts (rutaSugerida).
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

revoke execute on function public.ruta_sugerida_produccion(uuid) from public, anon;
grant execute on function public.ruta_sugerida_produccion(uuid) to authenticated;

-- Crea la ruta sugerida si el mueble aún no tiene. Uso interno: la llaman
-- crear_asignacion_produccion y guardar_ruta_produccion con el ítem bloqueado.
create or replace function public.asegurar_ruta_produccion(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.rutas_produccion (planeacion_item_id)
  values (p_item_id)
  on conflict (planeacion_item_id) do nothing;
  if not found then
    return;
  end if;
  insert into public.pasos_ruta_produccion (planeacion_item_id, orden, proceso)
  select p_item_id, s.n, s.proceso
  from unnest(public.ruta_sugerida_produccion(p_item_id)) with ordinality as s(proceso, n);
end;
$$;

revoke execute on function public.asegurar_ruta_produccion(uuid) from public, anon, authenticated;

-- 3. Rutas de los muebles que ya tienen asignaciones --------------------------
-- Un paso por proceso: los de la sugerida más cualquier proceso que ya se haya
-- asignado aunque hoy la descripción no lo mencione.
insert into public.rutas_produccion (planeacion_item_id, actualizado_por)
select distinct a.planeacion_item_id, null::uuid
from public.asignaciones_produccion a
join public.planeacion_items pi on pi.id = a.planeacion_item_id
where pi.tipo_registro = 'MO';

insert into public.pasos_ruta_produccion (planeacion_item_id, orden, proceso, creado_por)
select r.planeacion_item_id,
       row_number() over (partition by r.planeacion_item_id order by o.n),
       o.proceso,
       null::uuid
from public.rutas_produccion r
cross join (values (1, 'armado'), (2, 'superficie_solida'), (3, 'barniz'), (4, 'electrificacion')) as o(n, proceso)
where o.proceso = any(public.ruta_sugerida_produccion(r.planeacion_item_id))
   or exists (
     select 1 from public.asignaciones_produccion a
     where a.planeacion_item_id = r.planeacion_item_id and a.proceso = o.proceso
   );

update public.asignaciones_produccion a
set paso_id = s.id
from public.pasos_ruta_produccion s
where s.planeacion_item_id = a.planeacion_item_id
  and s.proceso = a.proceso
  and a.paso_id is null;

-- 4. El retrabajo hereda el paso ---------------------------------------------
-- crear_retrabajo_produccion no sabe de rutas: el paso sale de la asignación
-- cuya entrega rechazó Calidad.
create or replace function public.paso_de_retrabajo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.informe_rechazo_id is not null and new.paso_id is null then
    select a.paso_id into new.paso_id
      from public.informes_calidad i
      join public.entregas_produccion e on e.id = i.entrega_id
      join public.asignaciones_produccion a on a.id = e.asignacion_id
      where i.id = new.informe_rechazo_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.paso_de_retrabajo() from public, anon, authenticated;

create trigger trg_paso_de_retrabajo
  before insert on public.asignaciones_produccion
  for each row execute function public.paso_de_retrabajo();

-- 5. Guardar la ruta ------------------------------------------------------------
-- p_pasos: [{ "id": uuid | null, "proceso": "armado" }, ...] en el orden nuevo.
-- Un paso con id se conserva (y se mueve); sin id es nuevo; los que no vienen se
-- quitan, salvo que tengan asignaciones vigentes. p_version_esperada = la
-- versión que se tenía abierta (0 si el mueble aún no tenía ruta).
create or replace function public.guardar_ruta_produccion(
  p_item_id uuid,
  p_pasos jsonb,
  p_version_esperada integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_version integer;
  v_paso jsonb;
  v_n integer := 0;
  v_id uuid;
  v_proceso text;
  v_existente record;
  v_ids uuid[] := '{}';
  v_quitado record;
  v_procesos text[] := '{}';
  v_etiqueta text;
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

  select version into v_version
    from public.rutas_produccion where planeacion_item_id = p_item_id
    for update;
  if coalesce(v_version, 0) <> p_version_esperada then
    raise exception 'Alguien más cambió la ruta de este mueble mientras la editabas. Recarga la página y vuelve a hacer tus cambios.';
  end if;

  if p_pasos is null or jsonb_typeof(p_pasos) <> 'array' or jsonb_array_length(p_pasos) = 0 then
    raise exception 'La ruta necesita al menos un paso.';
  end if;
  if jsonb_array_length(p_pasos) > 12 then
    raise exception 'La ruta no puede pasar de 12 pasos.';
  end if;

  if v_version is null then
    insert into public.rutas_produccion (planeacion_item_id, version)
    values (p_item_id, 0);
  end if;

  -- Validar todos los pasos antes de tocar nada.
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
        where s.id = v_id and s.planeacion_item_id = p_item_id and s.retirado_en is null;
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

  -- Los pasos que no vienen se quitan, si no tienen asignaciones vigentes.
  for v_quitado in
    select s.id, s.orden, s.proceso
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.retirado_en is null
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
    update public.pasos_ruta_produccion
      set retirado_en = now(), retirado_por = auth.uid()
      where id = v_quitado.id;
  end loop;

  -- Reordenar: primero fuera del rango para no chocar con el índice único.
  update public.pasos_ruta_produccion
    set orden = orden + 1000
    where planeacion_item_id = p_item_id and retirado_en is null;

  v_n := 0;
  for v_paso in select value from jsonb_array_elements(p_pasos) loop
    v_n := v_n + 1;
    v_proceso := v_paso->>'proceso';
    v_procesos := v_procesos || v_proceso;
    if nullif(v_paso->>'id', '') is not null then
      update public.pasos_ruta_produccion set orden = v_n where id = (v_paso->>'id')::uuid;
    else
      insert into public.pasos_ruta_produccion (planeacion_item_id, orden, proceso)
      values (p_item_id, v_n, v_proceso);
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
            'modelo', v_item.modelo, 'ruta', v_etiqueta, 'version', v_version
          ));

  return v_version;
end;
$$;

revoke execute on function public.guardar_ruta_produccion(uuid, jsonb, integer) from public, anon;
grant execute on function public.guardar_ruta_produccion(uuid, jsonb, integer) to authenticated;

-- 6. Asignar a un paso --------------------------------------------------------
-- p_paso_id es opcional para no romper a quien todavía no lo manda (la pantalla
-- anterior, la asignación en lote): sin él se usa el primer paso de ese proceso
-- que aún tenga lugar.
drop function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text, text);

create or replace function public.crear_asignacion_produccion(
  p_item_id uuid,
  p_equipo_id uuid,
  p_proceso text,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text,
  p_encargado text default null,
  p_paso_id uuid default null
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
  v_anterior uuid;
  v_asignado numeric;
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

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (p_proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, p_proceso;
  end if;

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
    select s.id, s.orden, s.proceso into v_paso
      from public.pasos_ruta_produccion s
      where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.proceso = p_proceso
        and coalesce((
          select sum(a.cantidad) from public.asignaciones_produccion a
          where a.paso_id = s.id and a.cancelada_en is null and a.informe_rechazo_id is null
        ), 0) < v_item.cantidad_total
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

  -- Tope por paso. El retrabajo no cuenta (informe_rechazo_id).
  select coalesce(sum(cantidad), 0) into v_asignado
    from public.asignaciones_produccion
    where paso_id = v_paso.id and cancelada_en is null and informe_rechazo_id is null;

  if v_asignado + p_cantidad > v_item.cantidad_total then
    raise exception 'En el paso % (%) solo quedan % por asignar de % (ya asignadas: %).',
      v_paso.orden, p_proceso, v_item.cantidad_total - v_asignado, v_item.cantidad_total, v_asignado;
  end if;

  -- ¿Se adelanta al paso anterior? Listo = lo que el paso anterior entregó y
  -- Producción verificó. No se bloquea: queda marcado.
  select s.id into v_anterior
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.orden < v_paso.orden
    order by s.orden desc
    limit 1;
  if v_anterior is not null then
    select coalesce(sum(x.cantidad), 0) into v_listo
      from public.entregas_produccion x
      join public.asignaciones_produccion a on a.id = x.asignacion_id
      where a.paso_id = v_anterior and a.cancelada_en is null and a.informe_rechazo_id is null
        and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null;
    v_adelantada := v_asignado + p_cantidad > v_listo;
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
    paso_id, adelantada
  ) values (
    v_item.id, v_item.pedido_id, v_item.numero_pedido, v_item.item_code, v_item.modelo,
    v_item.descripcion, v_item.unidad, p_equipo_id, p_proceso, p_cantidad,
    p_fecha_asignacion, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado,
    v_paso.id, v_adelantada
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text, text, uuid) from public, anon;
grant execute on function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text, text, uuid) to authenticated;

-- 7. Resumen con el paso -------------------------------------------------------
-- Mismas columnas que antes, más paso_id y adelantada al final.
create or replace view public.asignaciones_produccion_resumen
with (security_invoker = true) as
select
  a.id,
  a.planeacion_item_id,
  a.pedido_id,
  a.numero_pedido,
  a.item_code,
  a.modelo,
  a.descripcion,
  a.unidad,
  a.equipo_id,
  e.nombre as equipo,
  e.encargado as equipo_encargado,
  e.es_planta,
  a.proceso,
  a.cantidad,
  a.fecha_asignacion,
  a.notas,
  a.creado_en,
  a.cancelada_en,
  a.motivo_cancelacion,
  coalesce(en.entregado, 0) as entregado,
  en.ultima_entrega,
  en.folios_calidad,
  coalesce(en.num_entregas, 0) as num_entregas,
  case
    when a.cancelada_en is not null then 'cancelada'
    when coalesce(en.entregado, 0) >= a.cantidad then 'entregada'
    when coalesce(en.entregado, 0) > 0 then 'parcial'
    else 'en_proceso'
  end as estado,
  coalesce(en.verificado, 0) as verificado,
  coalesce(en.entregado, 0) - coalesce(en.verificado, 0) as por_verificar,
  en.ultima_verificacion,
  a.informe_rechazo_id,
  ir.folio as folio_rechazo,
  fc.folios_cal,
  a.encargado,
  a.paso_id,
  a.adelantada
from public.asignaciones_produccion a
join public.equipos_produccion e on e.id = a.equipo_id
left join public.informes_calidad ir on ir.id = a.informe_rechazo_id
left join lateral (
  select sum(x.cantidad) as entregado,
         max(x.fecha_entrega) as ultima_entrega,
         string_agg(x.folios_calidad, ', ' order by x.fecha_entrega, x.registrado_en) as folios_calidad,
         count(*) as num_entregas,
         sum(x.cantidad) filter (where x.verificada_en is not null) as verificado,
         max((x.verificada_en at time zone 'America/Mexico_City')::date) as ultima_verificacion
  from public.entregas_produccion x
  where x.asignacion_id = a.id and x.anulada_en is null and x.rechazada_en is null
) en on true
left join lateral (
  select string_agg(i.folio, ', ' order by i.elaborado_en) as folios_cal
  from public.entregas_produccion x2
  join public.informes_calidad i on i.entrega_id = x2.id
  where x2.asignacion_id = a.id
) fc on true;
