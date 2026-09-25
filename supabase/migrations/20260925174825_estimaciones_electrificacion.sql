-- ============================================================================
-- Estimaciones — precio sugerido de maquila de ELECTRIFICACIÓN.
--
-- Mismo encabezado de recibo que Acabados (folio, fecha, contratista, obra,
-- OT, prioridad), pero cada renglón es: modelo + metros de LED (con su
-- complejidad de colocación) + kit de charolas (cada charola con su número
-- de drivers). Tablas propias para no mezclar renglones de otra naturaleza
-- con los de Acabados (el motor de precedentes de Acabados lee `renglones`).
--
-- Categoría de charola por drivers (parametrización interna):
--   sencilla   = 1 a 3 drivers
--   intermedia = 4 a 6 drivers
--   compleja   = más de 6 drivers
-- ============================================================================

create type public.est_complejidad_led as enum ('facil', 'medio', 'dificil');
create type public.est_categoria_charola as enum ('sencilla', 'intermedia', 'compleja');

-- Wrapper IMMUTABLE para la columna generada de categoría (mismo motivo que
-- est_tamano_texto: el cast a enum propio no queda marcado IMMUTABLE).
create or replace function public.est_categoria_charola_de(p_drivers integer)
returns public.est_categoria_charola
language sql
immutable
set search_path = ''
as $$
  select case
    when p_drivers <= 3 then 'sencilla'::public.est_categoria_charola
    when p_drivers <= 6 then 'intermedia'::public.est_categoria_charola
    else 'compleja'::public.est_categoria_charola
  end
$$;

-- ---------------------------------------------------------------------------
-- tarifas_electrificacion: precio por metro de LED según complejidad, y
-- precio por charola según su categoría. Editables por el admin del área.
-- ---------------------------------------------------------------------------
create table public.tarifas_electrificacion (
  id uuid primary key default gen_random_uuid(),
  concepto text not null check (concepto in ('metro_led', 'charola')),
  clave text not null,
  tarifa numeric(12, 2) not null check (tarifa >= 0),
  descripcion text,
  unique (concepto, clave)
);

-- ---------------------------------------------------------------------------
-- recibos_electrificacion: misma forma que `recibos`.
-- ---------------------------------------------------------------------------
create table public.recibos_electrificacion (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  fecha_recibo date not null,
  contratista text not null,
  obra text,
  ot text,
  prioridad public.est_prioridad not null default 'normal',
  motivo_prioridad text,
  capturado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  constraint recibos_electrificacion_motivo_prioridad_check check (
    prioridad = 'normal' or nullif(btrim(coalesce(motivo_prioridad, '')), '') is not null
  )
);
create index idx_recibos_electrificacion_fecha on public.recibos_electrificacion (fecha_recibo);

-- ---------------------------------------------------------------------------
-- renglones_electrificacion: el precio es por renglón completo (LED + kit),
-- así que importe = pu_aceptado.
-- ---------------------------------------------------------------------------
create table public.renglones_electrificacion (
  id uuid primary key default gen_random_uuid(),
  recibo_id uuid not null references public.recibos_electrificacion(id) on delete cascade,
  numero integer not null check (numero > 0),
  modelo text not null,
  metros_led numeric(12, 2) not null default 0 check (metros_led >= 0),
  complejidad_led public.est_complejidad_led,
  pu_sugerido numeric(12, 2),
  fuente_sugerido text not null check (fuente_sugerido in ('parametrico', 'manual')),
  pu_propuesto numeric(12, 2) not null check (pu_propuesto >= 0),
  pu_aceptado numeric(12, 2) not null check (pu_aceptado >= 0),
  banda public.est_banda not null,
  justificacion text,
  importe numeric(14, 2) generated always as (pu_aceptado) stored,
  nota text,
  creado_en timestamptz not null default now(),
  unique (recibo_id, numero),
  constraint renglones_electrificacion_led_check check (
    metros_led = 0 or complejidad_led is not null
  ),
  constraint renglones_electrificacion_justificacion_check check (
    banda <> 'justificar' or nullif(btrim(coalesce(justificacion, '')), '') is not null
  )
);
create index idx_renglones_electrificacion_recibo on public.renglones_electrificacion (recibo_id);

-- ---------------------------------------------------------------------------
-- charolas_electrificacion: el kit de charolas del renglón, una fila por
-- charola con su número de drivers. La categoría se deriva, nunca se captura.
-- ---------------------------------------------------------------------------
create table public.charolas_electrificacion (
  id uuid primary key default gen_random_uuid(),
  renglon_id uuid not null references public.renglones_electrificacion(id) on delete cascade,
  numero integer not null check (numero > 0),
  drivers integer not null check (drivers > 0),
  categoria public.est_categoria_charola
    generated always as (public.est_categoria_charola_de(drivers)) stored,
  unique (renglon_id, numero)
);
create index idx_charolas_electrificacion_renglon on public.charolas_electrificacion (renglon_id);

-- ---------------------------------------------------------------------------
-- RLS — mismo criterio que Acabados: cerrado al área, sin DELETE.
-- ---------------------------------------------------------------------------
alter table public.tarifas_electrificacion enable row level security;
alter table public.recibos_electrificacion enable row level security;
alter table public.renglones_electrificacion enable row level security;
alter table public.charolas_electrificacion enable row level security;

create policy "estimaciones_select_tarifas_electrificacion" on public.tarifas_electrificacion
  for select using (public.is_estimaciones());
create policy "estimaciones_select_recibos_electrificacion" on public.recibos_electrificacion
  for select using (public.is_estimaciones());
create policy "estimaciones_select_renglones_electrificacion" on public.renglones_electrificacion
  for select using (public.is_estimaciones());
create policy "estimaciones_select_charolas_electrificacion" on public.charolas_electrificacion
  for select using (public.is_estimaciones());

create policy "estimaciones_insert_recibos_electrificacion" on public.recibos_electrificacion
  for insert with check (public.is_estimaciones());
create policy "estimaciones_update_recibos_electrificacion" on public.recibos_electrificacion
  for update using (public.is_estimaciones()) with check (public.is_estimaciones());
create policy "estimaciones_insert_renglones_electrificacion" on public.renglones_electrificacion
  for insert with check (public.is_estimaciones());
create policy "estimaciones_update_renglones_electrificacion" on public.renglones_electrificacion
  for update using (public.is_estimaciones()) with check (public.is_estimaciones());
create policy "estimaciones_insert_charolas_electrificacion" on public.charolas_electrificacion
  for insert with check (public.is_estimaciones());
create policy "estimaciones_update_charolas_electrificacion" on public.charolas_electrificacion
  for update using (public.is_estimaciones()) with check (public.is_estimaciones());

create policy "admin_estimaciones_insert_tarifas_electrificacion" on public.tarifas_electrificacion
  for insert with check (public.is_admin_area('estimaciones'));
create policy "admin_estimaciones_update_tarifas_electrificacion" on public.tarifas_electrificacion
  for update using (public.is_admin_area('estimaciones')) with check (public.is_admin_area('estimaciones'));

-- ---------------------------------------------------------------------------
-- Datos iniciales — tarifas de arranque, SIN CALIBRAR: se ajustan con los
-- primeros recibos reales aceptados.
-- ---------------------------------------------------------------------------
insert into public.tarifas_electrificacion (concepto, clave, tarifa, descripcion) values
  ('metro_led', 'facil', 25, 'Colocación de LED fácil, por metro'),
  ('metro_led', 'medio', 40, 'Colocación de LED media, por metro'),
  ('metro_led', 'dificil', 60, 'Colocación de LED difícil, por metro'),
  ('charola', 'sencilla', 150, 'Charola de 1 a 3 drivers'),
  ('charola', 'intermedia', 250, 'Charola de 4 a 6 drivers'),
  ('charola', 'compleja', 400, 'Charola de más de 6 drivers');

-- ---------------------------------------------------------------------------
-- guardar_recibo_electrificacion: alta atómica (o continuación de folio),
-- mismo contrato que guardar_recibo_acabados. Cada renglón trae su arreglo
-- `charolas` = [{ "drivers": n }, ...].
-- ---------------------------------------------------------------------------
create or replace function public.guardar_recibo_electrificacion(
  p_folio text,
  p_fecha_recibo date,
  p_contratista text,
  p_obra text,
  p_ot text,
  p_prioridad public.est_prioridad,
  p_motivo_prioridad text,
  p_renglones jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recibo_id uuid;
  v_renglon_id uuid;
  v_siguiente_numero integer;
  v_num_charola integer;
  r jsonb;
  c jsonb;
begin
  if not public.is_estimaciones() then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;

  select id into v_recibo_id from public.recibos_electrificacion where folio = p_folio;

  if v_recibo_id is null then
    insert into public.recibos_electrificacion (
      folio, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, capturado_por
    ) values (
      p_folio, p_fecha_recibo, p_contratista, nullif(p_obra, ''), nullif(p_ot, ''),
      p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
    )
    returning id into v_recibo_id;
    v_siguiente_numero := 1;
  else
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones_electrificacion where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, metros_led, complejidad_led, pu_sugerido, fuente_sugerido,
      pu_propuesto, pu_aceptado, banda, justificacion, nota
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      coalesce((r->>'metrosLed')::numeric, 0),
      nullif(r->>'complejidadLed', '')::public.est_complejidad_led,
      nullif(r->>'puSugerido', '')::numeric,
      r->>'fuente',
      (r->>'propuesto')::numeric,
      (r->>'aceptado')::numeric,
      (r->>'banda')::public.est_banda,
      nullif(r->>'justificacion', ''),
      nullif(r->>'nota', '')
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

  return v_recibo_id;
end;
$$;

revoke execute on function public.guardar_recibo_electrificacion(
  text, date, text, text, text, public.est_prioridad, text, jsonb
) from public, anon;
grant execute on function public.guardar_recibo_electrificacion(
  text, date, text, text, text, public.est_prioridad, text, jsonb
) to authenticated;
