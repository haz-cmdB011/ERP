-- ============================================================================
-- Estimaciones — maquiladores como usuarios y flujo de revisión y pago.
--
-- * Nuevo rol 'maquilador' (usuario EXTERNO, siempre del área estimaciones,
--   con su nombre de contratista fijo en perfiles.contratista). Solo captura
--   SUS recibos con su precio propuesto; nunca ve el sugerido ni decide.
-- * Revisan (aceptan o modifican el precio de cada renglón): desarrollador,
--   administrador y trabajador de Estimaciones — is_estimaciones(), que a
--   propósito NO incluye al maquilador.
-- * Cada recibo avanza: pendiente -> revisado -> pagado (o cancelado). Al
--   maquilador no se le paga hasta que el recibo está revisado; lo marca
--   como pagado el mismo personal de Estimaciones.
-- * Cada renglón guarda su decisión: null (pendiente) | 'aceptado' (se paga
--   lo que propuso) | 'modificado' (se paga otro precio).
-- * El maquilador queda fuera de la lectura "abierta a cualquier
--   autenticado" del resto del ERP (pedidos, ítems, planos, perfiles...).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Perfiles: rol maquilador + contratista
-- ---------------------------------------------------------------------------
alter table public.perfiles add column contratista text;

alter table public.perfiles drop constraint perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('desarrollador', 'administrador', 'trabajador', 'usuario', 'maquilador'));

alter table public.perfiles add constraint perfiles_maquilador_check check (
  rol <> 'maquilador'
  or (area = 'estimaciones' and nullif(btrim(coalesce(contratista, '')), '') is not null)
);

-- El contratista es tan privilegiado como el rol: es lo que se imprime en
-- los recibos del maquilador, así que él mismo no puede cambiárselo.
create or replace function public.protect_perfiles_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    if new.rol is distinct from old.rol
       or new.area is distinct from old.area
       or new.contratista is distinct from old.contratista then
      raise exception 'Solo un administrador puede cambiar rol, área o contratista';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.is_maquilador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles where id = auth.uid() and rol = 'maquilador'
  );
$$;
revoke execute on function public.is_maquilador() from public, anon;
grant execute on function public.is_maquilador() to authenticated;

create or replace function public.mi_contratista()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select contratista from public.perfiles where id = auth.uid() and rol = 'maquilador';
$$;
revoke execute on function public.mi_contratista() from public, anon;
grant execute on function public.mi_contratista() to authenticated;

-- ---------------------------------------------------------------------------
-- Cerrar al maquilador el resto del ERP. Mismas políticas que ya existían
-- (lectura para cualquier autenticado) con la excepción del maquilador.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'cargas_archivo', 'folios_produccion', 'informes_calidad', 'pedido_versiones', 'pedidos',
    'planeacion_item_imagenes', 'planeacion_items', 'planos', 'proyectos',
    'retroalimentaciones', 'revisiones_cantidad'
  ]
  loop
    execute format('drop policy %I on public.%I', 'authenticated_select_' || t, t);
    execute format(
      'create policy %I on public.%I for select using ('
      || '(select auth.role()) = ''authenticated'' and not (select public.is_maquilador()))',
      'authenticated_select_' || t, t
    );
  end loop;
end;
$$;

-- Perfiles: el maquilador solo se ve a sí mismo (no la lista de usuarios).
drop policy "perfiles_select_all_authenticated" on public.perfiles;
create policy "perfiles_select_all_authenticated" on public.perfiles
  for select using (
    (select auth.uid()) = id
    or ((select auth.role()) = 'authenticated' and not (select public.is_maquilador()))
  );

-- Archivos de Planeación (Excel de cargas e imágenes de ítems).
drop policy "authenticated_select_cargas_excel" on storage.objects;
create policy "authenticated_select_cargas_excel" on storage.objects
  for select to authenticated
  using (bucket_id = 'cargas-excel' and not (select public.is_maquilador()));
drop policy "authenticated_insert_cargas_excel" on storage.objects;
create policy "authenticated_insert_cargas_excel" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cargas-excel' and not (select public.is_maquilador()));
drop policy "authenticated_select_planeacion_item_imagenes_bucket" on storage.objects;
create policy "authenticated_select_planeacion_item_imagenes_bucket" on storage.objects
  for select to authenticated
  using (bucket_id = 'planeacion-item-imagenes' and not (select public.is_maquilador()));
drop policy "authenticated_insert_planeacion_item_imagenes_bucket" on storage.objects;
create policy "authenticated_insert_planeacion_item_imagenes_bucket" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'planeacion-item-imagenes' and not (select public.is_maquilador()));

-- ---------------------------------------------------------------------------
-- Estado del recibo (Acabados/Armado en `recibos`; Electrificación aparte)
-- ---------------------------------------------------------------------------
alter table public.recibos
  add column estado text not null default 'pendiente'
    check (estado in ('pendiente', 'revisado', 'pagado', 'cancelado')),
  add column revisado_por uuid references auth.users(id),
  add column revisado_en timestamptz,
  add column pagado_por uuid references auth.users(id),
  add column pagado_en timestamptz,
  add column cancelado_por uuid references auth.users(id),
  add column cancelado_en timestamptz;

alter table public.recibos_electrificacion
  add column estado text not null default 'pendiente'
    check (estado in ('pendiente', 'revisado', 'pagado', 'cancelado')),
  add column revisado_por uuid references auth.users(id),
  add column revisado_en timestamptz,
  add column pagado_por uuid references auth.users(id),
  add column pagado_en timestamptz,
  add column cancelado_por uuid references auth.users(id),
  add column cancelado_en timestamptz;

-- Un folio cancelado deja de ocupar el folio: el maquilador puede volver a
-- capturarlo corregido.
alter table public.recibos drop constraint recibos_tipo_folio_key;
create unique index recibos_tipo_folio_vigente
  on public.recibos (tipo, folio) where estado <> 'cancelado';
alter table public.recibos_electrificacion drop constraint recibos_electrificacion_folio_key;
create unique index recibos_electrificacion_folio_vigente
  on public.recibos_electrificacion (folio) where estado <> 'cancelado';

create index idx_recibos_estado on public.recibos (estado);
create index idx_recibos_capturado_por on public.recibos (capturado_por);
create index idx_recibos_electrificacion_estado on public.recibos_electrificacion (estado);
create index idx_recibos_electrificacion_capturado_por on public.recibos_electrificacion (capturado_por);

-- ---------------------------------------------------------------------------
-- Decisión por renglón. La banda se calcula al revisar, así que un renglón
-- pendiente del maquilador puede no tenerla todavía.
-- ---------------------------------------------------------------------------
alter table public.renglones
  add column decision text check (decision in ('aceptado', 'modificado')),
  alter column banda drop not null;
alter table public.renglones add constraint renglones_decision_banda_check
  check (decision is null or banda is not null);

alter table public.renglones_electrificacion
  add column decision text check (decision in ('aceptado', 'modificado')),
  alter column banda drop not null;
alter table public.renglones_electrificacion add constraint renglones_electrificacion_decision_banda_check
  check (decision is null or banda is not null);

-- Datos existentes: antes "pendiente" era aceptado = 0 con propuesto > 0.
update public.renglones set decision = case
  when pu_aceptado = 0 and pu_propuesto > 0 then null
  when pu_aceptado = pu_propuesto then 'aceptado'
  else 'modificado' end;
update public.renglones_electrificacion set decision = case
  when pu_aceptado = 0 and pu_propuesto > 0 then null
  when pu_aceptado = pu_propuesto then 'aceptado'
  else 'modificado' end;
update public.recibos r set estado = 'revisado', revisado_en = now()
  where not exists (select 1 from public.renglones g where g.recibo_id = r.id and g.decision is null);
update public.recibos_electrificacion r set estado = 'revisado', revisado_en = now()
  where not exists (
    select 1 from public.renglones_electrificacion g where g.recibo_id = r.id and g.decision is null
  );

-- ---------------------------------------------------------------------------
-- RLS del maquilador: solo sus recibos, solo lectura directa. Las altas van
-- por las RPC de guardado (security invoker), que fuerzan sus valores.
-- ---------------------------------------------------------------------------
create policy "maquilador_select_recibos" on public.recibos
  for select using ((select public.is_maquilador()) and capturado_por = (select auth.uid()));
create policy "maquilador_select_renglones" on public.renglones
  for select using (
    (select public.is_maquilador()) and exists (
      select 1 from public.recibos r
      where r.id = recibo_id and r.capturado_por = (select auth.uid())
    )
  );
create policy "maquilador_insert_recibos" on public.recibos
  for insert with check (
    (select public.is_maquilador()) and capturado_por = (select auth.uid()) and estado = 'pendiente'
  );
create policy "maquilador_insert_renglones" on public.renglones
  for insert with check (
    (select public.is_maquilador())
    and decision is null and pu_aceptado = 0 and pu_sugerido is null
    and exists (
      select 1 from public.recibos r
      where r.id = recibo_id and r.capturado_por = (select auth.uid()) and r.estado = 'pendiente'
    )
  );

create policy "maquilador_select_recibos_electrificacion" on public.recibos_electrificacion
  for select using ((select public.is_maquilador()) and capturado_por = (select auth.uid()));
create policy "maquilador_select_renglones_electrificacion" on public.renglones_electrificacion
  for select using (
    (select public.is_maquilador()) and exists (
      select 1 from public.recibos_electrificacion r
      where r.id = recibo_id and r.capturado_por = (select auth.uid())
    )
  );
create policy "maquilador_select_charolas_electrificacion" on public.charolas_electrificacion
  for select using (
    (select public.is_maquilador()) and exists (
      select 1 from public.renglones_electrificacion g
      join public.recibos_electrificacion r on r.id = g.recibo_id
      where g.id = renglon_id and r.capturado_por = (select auth.uid())
    )
  );
create policy "maquilador_insert_recibos_electrificacion" on public.recibos_electrificacion
  for insert with check (
    (select public.is_maquilador()) and capturado_por = (select auth.uid()) and estado = 'pendiente'
  );
create policy "maquilador_insert_renglones_electrificacion" on public.renglones_electrificacion
  for insert with check (
    (select public.is_maquilador())
    and decision is null and pu_aceptado = 0 and pu_sugerido is null
    and exists (
      select 1 from public.recibos_electrificacion r
      where r.id = recibo_id and r.capturado_por = (select auth.uid()) and r.estado = 'pendiente'
    )
  );
create policy "maquilador_insert_charolas_electrificacion" on public.charolas_electrificacion
  for insert with check (
    (select public.is_maquilador()) and exists (
      select 1 from public.renglones_electrificacion g
      join public.recibos_electrificacion r on r.id = g.recibo_id
      where g.id = renglon_id and r.capturado_por = (select auth.uid()) and r.estado = 'pendiente'
    )
  );

-- ---------------------------------------------------------------------------
-- Guardado. Mismas firmas que antes (los grants se conservan). Reglas nuevas:
--   * El maquilador guarda con SU contratista, sin sugerido, sin aceptado y
--     sin decisión: todo queda pendiente de revisión.
--   * Quien revisa y captura a la vez deja decidido cada renglón con
--     aceptado > 0; si deja aceptado en 0 queda pendiente (como antes).
--   * Continuar un folio: nunca uno pagado o cancelado; el maquilador solo
--     los suyos y solo mientras estén pendientes.
--   * El recibo queda 'revisado' en cuanto no le quedan renglones pendientes.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_recibo_acabados(
  p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text,
  p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_maq boolean := public.is_maquilador();
  v_contratista text := p_contratista;
  v_recibo_id uuid;
  v_estado text;
  v_siguiente_numero integer;
  v_aceptado numeric;
  v_propuesto numeric;
  r jsonb;
begin
  if not (public.is_estimaciones() or v_maq) then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;
  if v_maq then
    v_contratista := public.mi_contratista();
  end if;

  select id, estado into v_recibo_id, v_estado
    from public.recibos where folio = p_folio and tipo = 'acabados' and estado <> 'cancelado';

  if v_recibo_id is null then
    begin
      insert into public.recibos (
        folio, tipo, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, capturado_por
      ) values (
        p_folio, 'acabados', p_fecha_recibo, v_contratista, nullif(p_obra, ''), nullif(p_ot, ''),
        p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
      )
      returning id into v_recibo_id;
    exception when unique_violation then
      raise exception 'El folio % ya está registrado.', p_folio;
    end;
    v_siguiente_numero := 1;
  else
    if v_estado in ('pagado') or (v_maq and v_estado <> 'pendiente') then
      raise exception 'El folio % ya fue %; no se le pueden agregar renglones.', p_folio, v_estado;
    end if;
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    v_propuesto := (r->>'propuesto')::numeric;
    v_aceptado := case when v_maq then 0 else (r->>'aceptado')::numeric end;

    insert into public.renglones (
      recibo_id, numero, modelo, familia, acabado, acabado_2, tipo_trabajo, causa_reproceso,
      cantidad, tamano, fases, pu_sugerido, fuente_sugerido, sin_tamano, pu_propuesto,
      pu_aceptado, banda, justificacion, nota, decision
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      r->>'familia',
      nullif(r->>'acabado', ''),
      nullif(r->>'acabado2', ''),
      coalesce((r->>'tipoTrabajo')::public.est_tipo_trabajo, 'produccion'),
      nullif(r->>'causa', ''),
      (r->>'cantidad')::numeric,
      nullif(r->>'tamano', '')::public.est_tamano,
      coalesce(
        (select array_agg(f) from jsonb_array_elements_text(coalesce(r->'fases', '[]'::jsonb)) f),
        '{}'
      ),
      case when v_maq then null else nullif(r->>'puSugerido', '')::numeric end,
      case when v_maq then 'manual' else (r->>'fuente')::public.est_fuente_sugerido end,
      coalesce((r->>'sinTamano')::boolean, false),
      v_propuesto,
      v_aceptado,
      case when v_maq then null else (r->>'banda')::public.est_banda end,
      case when v_maq then null else nullif(r->>'justificacion', '') end,
      nullif(r->>'nota', ''),
      case
        when v_maq or (v_aceptado = 0 and v_propuesto > 0) then null
        when v_aceptado = v_propuesto then 'aceptado'
        else 'modificado'
      end
    );
    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  perform public.est_actualizar_estado_recibo('acabados', v_recibo_id);
  return v_recibo_id;
end;
$$;

create or replace function public.guardar_recibo_armado(
  p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text,
  p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_maq boolean := public.is_maquilador();
  v_contratista text := p_contratista;
  v_recibo_id uuid;
  v_estado text;
  v_siguiente_numero integer;
  v_aceptado numeric;
  v_propuesto numeric;
  r jsonb;
begin
  if not (public.is_estimaciones() or v_maq) then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;
  if v_maq then
    v_contratista := public.mi_contratista();
  end if;

  select id, estado into v_recibo_id, v_estado
    from public.recibos where folio = p_folio and tipo = 'armado' and estado <> 'cancelado';

  if v_recibo_id is null then
    begin
      insert into public.recibos (
        folio, tipo, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, capturado_por
      ) values (
        p_folio, 'armado', p_fecha_recibo, v_contratista, nullif(p_obra, ''), nullif(p_ot, ''),
        p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
      )
      returning id into v_recibo_id;
    exception when unique_violation then
      raise exception 'El folio % ya está registrado.', p_folio;
    end;
    v_siguiente_numero := 1;
  else
    if v_estado in ('pagado') or (v_maq and v_estado <> 'pendiente') then
      raise exception 'El folio % ya fue %; no se le pueden agregar renglones.', p_folio, v_estado;
    end if;
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    if coalesce(r->>'tipoArmado', '') not in ('Natural', 'Laminado') then
      raise exception 'Renglón %: falta el tipo de armado (Natural o Laminado).',
        v_siguiente_numero;
    end if;

    v_propuesto := (r->>'propuesto')::numeric;
    v_aceptado := case when v_maq then 0 else (r->>'aceptado')::numeric end;

    insert into public.renglones (
      recibo_id, numero, modelo, familia, tipo_armado, colocacion_herrajes, tipo_trabajo,
      causa_reproceso, cantidad, tamano, pu_sugerido, fuente_sugerido, sin_tamano,
      pu_propuesto, pu_aceptado, banda, justificacion, nota, decision
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      r->>'familia',
      r->>'tipoArmado',
      coalesce((r->>'colocacionHerrajes')::boolean, false),
      coalesce((r->>'tipoTrabajo')::public.est_tipo_trabajo, 'produccion'),
      nullif(r->>'causa', ''),
      (r->>'cantidad')::numeric,
      nullif(r->>'tamano', '')::public.est_tamano,
      case when v_maq then null else nullif(r->>'puSugerido', '')::numeric end,
      case when v_maq then 'manual' else (r->>'fuente')::public.est_fuente_sugerido end,
      coalesce((r->>'sinTamano')::boolean, false),
      v_propuesto,
      v_aceptado,
      case when v_maq then null else (r->>'banda')::public.est_banda end,
      case when v_maq then null else nullif(r->>'justificacion', '') end,
      nullif(r->>'nota', ''),
      case
        when v_maq or (v_aceptado = 0 and v_propuesto > 0) then null
        when v_aceptado = v_propuesto then 'aceptado'
        else 'modificado'
      end
    );
    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  perform public.est_actualizar_estado_recibo('armado', v_recibo_id);
  return v_recibo_id;
end;
$$;

create or replace function public.guardar_recibo_electrificacion(
  p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text,
  p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_maq boolean := public.is_maquilador();
  v_contratista text := p_contratista;
  v_recibo_id uuid;
  v_renglon_id uuid;
  v_estado text;
  v_siguiente_numero integer;
  v_num_charola integer;
  v_aceptado numeric;
  v_propuesto numeric;
  r jsonb;
  c jsonb;
begin
  if not (public.is_estimaciones() or v_maq) then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;
  if v_maq then
    v_contratista := public.mi_contratista();
  end if;

  select id, estado into v_recibo_id, v_estado
    from public.recibos_electrificacion where folio = p_folio and estado <> 'cancelado';

  if v_recibo_id is null then
    begin
      insert into public.recibos_electrificacion (
        folio, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, capturado_por
      ) values (
        p_folio, p_fecha_recibo, v_contratista, nullif(p_obra, ''), nullif(p_ot, ''),
        p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
      )
      returning id into v_recibo_id;
    exception when unique_violation then
      raise exception 'El folio % ya está registrado.', p_folio;
    end;
    v_siguiente_numero := 1;
  else
    if v_estado in ('pagado') or (v_maq and v_estado <> 'pendiente') then
      raise exception 'El folio % ya fue %; no se le pueden agregar renglones.', p_folio, v_estado;
    end if;
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones_electrificacion where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    v_propuesto := (r->>'propuesto')::numeric;
    v_aceptado := case when v_maq then 0 else (r->>'aceptado')::numeric end;

    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota, decision
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      coalesce((r->>'cantidad')::numeric, 1),
      coalesce((r->>'metrosLed')::numeric, 0),
      nullif(r->>'complejidadLed', '')::public.est_complejidad_led,
      case when v_maq then null else nullif(r->>'puSugerido', '')::numeric end,
      case when v_maq then 'manual' else r->>'fuente' end,
      v_propuesto,
      v_aceptado,
      case when v_maq then null else (r->>'banda')::public.est_banda end,
      case when v_maq then null else nullif(r->>'justificacion', '') end,
      nullif(r->>'nota', ''),
      case
        when v_maq or (v_aceptado = 0 and v_propuesto > 0) then null
        when v_aceptado = v_propuesto then 'aceptado'
        else 'modificado'
      end
    )
    returning id into v_renglon_id;

    v_num_charola := 1;
    for c in select * from jsonb_array_elements(coalesce(r->'charolas', '[]'::jsonb))
    loop
      insert into public.charolas_electrificacion (renglon_id, numero, drivers)
      values (v_renglon_id, v_num_charola, (c->>'drivers')::integer);
      v_num_charola := v_num_charola + 1;
    end loop;

    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  perform public.est_actualizar_estado_recibo('electrificacion', v_recibo_id);
  return v_recibo_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers de estado. p_tipo: 'acabados' | 'armado' | 'electrificacion'.
-- ---------------------------------------------------------------------------

-- Pasa un recibo pendiente a 'revisado' cuando ya no le quedan renglones
-- sin decidir (lo usan el guardado y la revisión). No toca pagados ni
-- cancelados. Security definer porque el maquilador no tiene UPDATE, pero
-- su propio guardado nunca lo hace avanzar (sus renglones van sin decidir).
create or replace function public.est_actualizar_estado_recibo(p_tipo text, p_recibo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pendientes integer;
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    return;
  end if;
  if p_tipo = 'electrificacion' then
    select count(*) into v_pendientes from public.renglones_electrificacion
      where recibo_id = p_recibo_id and decision is null;
    if v_pendientes = 0 then
      update public.recibos_electrificacion
        set estado = 'revisado', revisado_por = auth.uid(), revisado_en = now()
        where id = p_recibo_id and estado = 'pendiente';
    end if;
  else
    select count(*) into v_pendientes from public.renglones
      where recibo_id = p_recibo_id and decision is null;
    if v_pendientes = 0 then
      update public.recibos
        set estado = 'revisado', revisado_por = auth.uid(), revisado_en = now()
        where id = p_recibo_id and estado = 'pendiente';
    end if;
  end if;
end;
$$;
-- Las RPC de guardado y revisión son security invoker y la llaman con los
-- permisos de quien guarda, así que authenticated necesita EXECUTE; la
-- validación de arriba impide usarla fuera del área.
revoke execute on function public.est_actualizar_estado_recibo(text, uuid) from public, anon;
grant execute on function public.est_actualizar_estado_recibo(text, uuid) to authenticated;

-- Decide un renglón (aceptar el propuesto o modificarlo). Solo revisores;
-- no en recibos pagados ni cancelados. Al quedar todos decididos, el
-- recibo pasa solo a 'revisado'.
create or replace function public.decidir_renglon(
  p_tipo text,
  p_renglon_id uuid,
  p_aceptado numeric,
  p_pu_sugerido numeric,
  p_fuente text,
  p_banda public.est_banda,
  p_justificacion text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recibo_id uuid;
  v_estado text;
  v_propuesto numeric;
begin
  if not public.is_estimaciones() then
    raise exception 'Solo el personal de Estimaciones puede revisar precios.';
  end if;
  if p_aceptado is null or p_aceptado < 0 then
    raise exception 'El precio aceptado no es válido.';
  end if;

  if p_tipo = 'electrificacion' then
    select g.recibo_id, r.estado, g.pu_propuesto into v_recibo_id, v_estado, v_propuesto
      from public.renglones_electrificacion g
      join public.recibos_electrificacion r on r.id = g.recibo_id
      where g.id = p_renglon_id;
  else
    select g.recibo_id, r.estado, g.pu_propuesto into v_recibo_id, v_estado, v_propuesto
      from public.renglones g join public.recibos r on r.id = g.recibo_id
      where g.id = p_renglon_id and r.tipo = p_tipo;
  end if;

  if v_recibo_id is null then
    raise exception 'Renglón no encontrado.';
  end if;
  if v_estado in ('pagado', 'cancelado') then
    raise exception 'El recibo ya está %; no se puede cambiar el precio.', v_estado;
  end if;

  if p_tipo = 'electrificacion' then
    update public.renglones_electrificacion set
      pu_aceptado = p_aceptado,
      pu_sugerido = p_pu_sugerido,
      fuente_sugerido = p_fuente,
      banda = p_banda,
      justificacion = nullif(btrim(coalesce(p_justificacion, '')), ''),
      decision = case when p_aceptado = v_propuesto then 'aceptado' else 'modificado' end
    where id = p_renglon_id;
  else
    update public.renglones set
      pu_aceptado = p_aceptado,
      pu_sugerido = p_pu_sugerido,
      fuente_sugerido = p_fuente::public.est_fuente_sugerido,
      banda = p_banda,
      justificacion = nullif(btrim(coalesce(p_justificacion, '')), ''),
      decision = case when p_aceptado = v_propuesto then 'aceptado' else 'modificado' end
    where id = p_renglon_id;
  end if;

  perform public.est_actualizar_estado_recibo(p_tipo, v_recibo_id);
end;
$$;
revoke execute on function public.decidir_renglon(text, uuid, numeric, numeric, text, public.est_banda, text)
  from public, anon;
grant execute on function public.decidir_renglon(text, uuid, numeric, numeric, text, public.est_banda, text)
  to authenticated;

-- Marca como pagado un recibo revisado. Solo personal de Estimaciones.
create or replace function public.marcar_recibo_pagado(p_tipo text, p_recibo_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_filas integer;
begin
  if not public.is_estimaciones() then
    raise exception 'Solo el personal de Estimaciones puede marcar recibos como pagados.';
  end if;

  if p_tipo = 'electrificacion' then
    update public.recibos_electrificacion
      set estado = 'pagado', pagado_por = auth.uid(), pagado_en = now()
      where id = p_recibo_id and estado = 'revisado';
  else
    update public.recibos
      set estado = 'pagado', pagado_por = auth.uid(), pagado_en = now()
      where id = p_recibo_id and tipo = p_tipo and estado = 'revisado';
  end if;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Solo se puede pagar un recibo revisado (todos sus renglones decididos).';
  end if;
end;
$$;
revoke execute on function public.marcar_recibo_pagado(text, uuid) from public, anon;
grant execute on function public.marcar_recibo_pagado(text, uuid) to authenticated;

-- Cancela un recibo pendiente. El maquilador solo los suyos y solo si nadie
-- ha decidido todavía ningún renglón; el personal de Estimaciones cualquier
-- pendiente. Security definer: el maquilador no tiene UPDATE directo.
create or replace function public.cancelar_recibo(p_tipo text, p_recibo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_maq boolean := public.is_maquilador();
  v_capturado_por uuid;
  v_estado text;
  v_decididos integer;
begin
  if not (public.is_estimaciones() or v_maq) then
    raise exception 'No tienes permiso para cancelar recibos.';
  end if;

  if p_tipo = 'electrificacion' then
    select capturado_por, estado into v_capturado_por, v_estado
      from public.recibos_electrificacion where id = p_recibo_id;
    select count(*) into v_decididos from public.renglones_electrificacion
      where recibo_id = p_recibo_id and decision is not null;
  elsif p_tipo in ('acabados', 'armado') then
    select capturado_por, estado into v_capturado_por, v_estado
      from public.recibos where id = p_recibo_id and tipo = p_tipo;
    select count(*) into v_decididos from public.renglones
      where recibo_id = p_recibo_id and decision is not null;
  else
    raise exception 'Tipo de recibo no válido.';
  end if;

  if v_estado is null then
    raise exception 'Recibo no encontrado.';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo se puede cancelar un recibo pendiente de revisión.';
  end if;
  if v_maq and (v_capturado_por is distinct from auth.uid() or v_decididos > 0) then
    raise exception 'Este recibo ya está en revisión; pide al personal de Estimaciones que lo corrija.';
  end if;

  if p_tipo = 'electrificacion' then
    update public.recibos_electrificacion
      set estado = 'cancelado', cancelado_por = auth.uid(), cancelado_en = now()
      where id = p_recibo_id;
  else
    update public.recibos
      set estado = 'cancelado', cancelado_por = auth.uid(), cancelado_en = now()
      where id = p_recibo_id;
  end if;
end;
$$;
revoke execute on function public.cancelar_recibo(text, uuid) from public, anon;
grant execute on function public.cancelar_recibo(text, uuid) to authenticated;
