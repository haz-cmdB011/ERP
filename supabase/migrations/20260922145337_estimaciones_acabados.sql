-- ============================================================================
-- Estimaciones — precio sugerido de maquila de ACABADOS.
--
-- El maquilador cobra por PIEZA TERMINADA. Las fases (limpieza, lijado,
-- sellado...) se guardan solo para auditoría: NO entran al cálculo del
-- precio. El tipo de acabado tampoco es factor, salvo cuando una pieza
-- lleva dos acabados distintos (recargo configurable).
--
-- Módulo cerrado: a diferencia de Planeación/Calidad (lectura abierta a
-- cualquier autenticado), aquí hasta el SELECT exige is_estimaciones() —
-- son precios de maquila.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.est_tamano as enum ('chico', 'mediano', 'grande');
create type public.est_tipo_tarifa as enum ('fija', 'base');
create type public.est_tipo_trabajo as enum ('produccion', 'reproceso');
create type public.est_prioridad as enum ('normal', 'preferente', 'urgente');
-- Nivel del motor que resolvió el precio (0..4). Se guarda SIEMPRE, también
-- cuando el nivel 3 corre en sombra y al estimador se le presenta 'manual'.
create type public.est_fuente_sugerido as enum (
  'proyecto', 'tarifa_fija', 'precedente', 'familia', 'manual'
);
create type public.est_banda as enum ('auto', 'estimador', 'justificar');
create type public.est_tipo_factor as enum ('volumen', 'prioridad', 'config');

-- ---------------------------------------------------------------------------
-- Permisos del área (espejo de is_calidad() / is_produccion())
-- ---------------------------------------------------------------------------
create or replace function public.is_estimaciones()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('administrador', 'trabajador') and area = 'estimaciones'
  );
$$;
revoke execute on function public.is_estimaciones() from public, anon;
grant execute on function public.is_estimaciones() to authenticated;

-- ---------------------------------------------------------------------------
-- Vocabularios (editables sin tocar código ni migrar)
-- ---------------------------------------------------------------------------
create table public.estimaciones_catalogos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('familia', 'acabado', 'fase', 'causa_reproceso')),
  valor text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  unique (tipo, valor)
);

-- ---------------------------------------------------------------------------
-- catalogo_modelos: un mismo modelo puede pertenecer a familias distintas
-- (en el histórico real, FAC-01 aparece como Marco y como Cerco), por eso
-- la identidad es el par modelo+familia y no el modelo solo.
-- El modelo se guarda normalizado: trim, mayúsculas, espacios colapsados.
-- ---------------------------------------------------------------------------
create table public.catalogo_modelos (
  id uuid primary key default gen_random_uuid(),
  modelo text not null,
  familia text not null,
  tamano public.est_tamano,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (modelo, familia)
);
create index idx_catalogo_modelos_modelo on public.catalogo_modelos (modelo);

-- Wrapper IMMUTABLE del cast enum→texto: el cast implícito que genera
-- Postgres para un enum propio no queda marcado IMMUTABLE, y los índices
-- parciales de abajo (coalesce sobre tamano) lo necesitan así.
create or replace function public.est_tamano_texto(t public.est_tamano)
returns text
language sql
immutable
set search_path = ''
as $$ select t::text $$;

-- ---------------------------------------------------------------------------
-- tarifas_familia: 'fija' = no hay negociación (nivel 1, sin factor de
-- volumen). 'base' = punto de partida del nivel 3, sí escala por volumen.
-- ---------------------------------------------------------------------------
create table public.tarifas_familia (
  id uuid primary key default gen_random_uuid(),
  familia text not null,
  tamano public.est_tamano,
  tarifa numeric(12, 2) not null check (tarifa >= 0),
  tipo public.est_tipo_tarifa not null,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  creado_en timestamptz not null default now()
);
-- Una sola tarifa vigente por familia+tamaño+tipo. El índice parcial deja
-- conservar el historial (filas con vigente_hasta) sin romper la unicidad.
create unique index idx_tarifas_familia_vigente
  on public.tarifas_familia (familia, coalesce(public.est_tamano_texto(tamano), ''), tipo)
  where vigente_hasta is null;

-- ---------------------------------------------------------------------------
-- tarifas_proyecto: precios negociados al inicio de una obra especial.
-- Ganan sobre todo lo demás (nivel 0).
-- ---------------------------------------------------------------------------
create table public.tarifas_proyecto (
  id uuid primary key default gen_random_uuid(),
  ot text not null,
  modelo text not null,
  tarifa numeric(12, 2) not null check (tarifa >= 0),
  vigente_desde date not null default current_date,
  creado_en timestamptz not null default now(),
  unique (ot, modelo)
);

-- ---------------------------------------------------------------------------
-- factores: escalones de volumen, multiplicadores de prioridad y banderas
-- de configuración. Todo editable desde la app, nada quemado en código.
-- rango_min/rango_max solo aplican a tipo='volumen' (rango_max null = sin
-- tope superior).
-- ---------------------------------------------------------------------------
create table public.factores (
  id uuid primary key default gen_random_uuid(),
  tipo public.est_tipo_factor not null,
  clave text not null,
  valor numeric(12, 4) not null,
  rango_min integer,
  rango_max integer,
  descripcion text,
  unique (tipo, clave)
);

-- ---------------------------------------------------------------------------
-- recibos: el maquilador sigue entregando papel; esto es su captura.
-- fecha_recibo es la del papel, NO la de captura (creado_en).
-- ---------------------------------------------------------------------------
create table public.recibos (
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
  -- Si no es Normal, el motivo es obligatorio.
  constraint recibos_motivo_prioridad_check check (
    prioridad = 'normal' or nullif(btrim(coalesce(motivo_prioridad, '')), '') is not null
  )
);
create index idx_recibos_fecha on public.recibos (fecha_recibo);

-- ---------------------------------------------------------------------------
-- renglones: el corazón del módulo.
-- pu_sugerido/fuente_sugerido se guardan SIEMPRE (incluido el nivel 3 en
-- sombra) para poder medir después el error del motor contra lo aceptado.
-- importe es calculado: nunca puede desincronizarse de cantidad×aceptado.
-- ---------------------------------------------------------------------------
create table public.renglones (
  id uuid primary key default gen_random_uuid(),
  recibo_id uuid not null references public.recibos(id) on delete cascade,
  numero integer not null check (numero > 0),
  modelo text not null,
  familia text not null,
  acabado text,
  acabado_2 text,
  tipo_trabajo public.est_tipo_trabajo not null default 'produccion',
  causa_reproceso text,
  cantidad numeric(12, 2) not null check (cantidad > 0),
  tamano public.est_tamano,
  fases text[] not null default '{}',
  pu_sugerido numeric(12, 2),
  fuente_sugerido public.est_fuente_sugerido not null,
  -- Marca del nivel 3 cuando no había tarifa para el tamaño y se usó la
  -- base de la familia sin tamaño.
  sin_tamano boolean not null default false,
  pu_propuesto numeric(12, 2) not null check (pu_propuesto >= 0),
  pu_aceptado numeric(12, 2) not null check (pu_aceptado >= 0),
  banda public.est_banda not null,
  justificacion text,
  importe numeric(14, 2) generated always as (cantidad * pu_aceptado) stored,
  nota text,
  creado_en timestamptz not null default now(),
  unique (recibo_id, numero),
  -- Banda 'justificar' (>25% de diferencia, o nivel 4) no se guarda sin
  -- justificación: es la regla de autorización, no una sugerencia de UI.
  constraint renglones_justificacion_check check (
    banda <> 'justificar' or nullif(btrim(coalesce(justificacion, '')), '') is not null
  )
);
create index idx_renglones_recibo on public.renglones (recibo_id);
-- El nivel 2 (precedente) busca por modelo el aceptado más reciente.
create index idx_renglones_modelo on public.renglones (modelo);

-- ---------------------------------------------------------------------------
-- promociones_tarifa: la recalibración PROPONE, no aplica. Cuando una
-- familia acumula 10 renglones aceptados al mismo PU con cantidad 1, se
-- registra aquí y un administrador del área decide.
-- ---------------------------------------------------------------------------
create table public.promociones_tarifa (
  id uuid primary key default gen_random_uuid(),
  familia text not null,
  tamano public.est_tamano,
  tarifa_propuesta numeric(12, 2) not null,
  renglones_soporte integer not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  detectada_en timestamptz not null default now(),
  resuelta_por uuid references auth.users(id),
  resuelta_en timestamptz
);
create unique index idx_promociones_pendiente
  on public.promociones_tarifa (familia, coalesce(public.est_tamano_texto(tamano), ''))
  where estado = 'pendiente';

-- ---------------------------------------------------------------------------
-- RLS — módulo cerrado al área. Sin políticas de DELETE a propósito
-- (mismo criterio que el resto de la app: el historial no se borra).
-- Las tarifas y factores solo los edita el administrador del área.
-- ---------------------------------------------------------------------------
alter table public.estimaciones_catalogos enable row level security;
alter table public.catalogo_modelos enable row level security;
alter table public.tarifas_familia enable row level security;
alter table public.tarifas_proyecto enable row level security;
alter table public.factores enable row level security;
alter table public.recibos enable row level security;
alter table public.renglones enable row level security;
alter table public.promociones_tarifa enable row level security;

-- Lectura: cualquiera del área.
create policy "estimaciones_select_catalogos" on public.estimaciones_catalogos
  for select using (public.is_estimaciones());
create policy "estimaciones_select_modelos" on public.catalogo_modelos
  for select using (public.is_estimaciones());
create policy "estimaciones_select_tarifas_familia" on public.tarifas_familia
  for select using (public.is_estimaciones());
create policy "estimaciones_select_tarifas_proyecto" on public.tarifas_proyecto
  for select using (public.is_estimaciones());
create policy "estimaciones_select_factores" on public.factores
  for select using (public.is_estimaciones());
create policy "estimaciones_select_recibos" on public.recibos
  for select using (public.is_estimaciones());
create policy "estimaciones_select_renglones" on public.renglones
  for select using (public.is_estimaciones());
create policy "estimaciones_select_promociones" on public.promociones_tarifa
  for select using (public.is_estimaciones());

-- Captura: cualquiera del área.
create policy "estimaciones_insert_modelos" on public.catalogo_modelos
  for insert with check (public.is_estimaciones());
create policy "estimaciones_update_modelos" on public.catalogo_modelos
  for update using (public.is_estimaciones()) with check (public.is_estimaciones());
create policy "estimaciones_insert_recibos" on public.recibos
  for insert with check (public.is_estimaciones());
create policy "estimaciones_update_recibos" on public.recibos
  for update using (public.is_estimaciones()) with check (public.is_estimaciones());
create policy "estimaciones_insert_renglones" on public.renglones
  for insert with check (public.is_estimaciones());
create policy "estimaciones_update_renglones" on public.renglones
  for update using (public.is_estimaciones()) with check (public.is_estimaciones());
create policy "estimaciones_insert_promociones" on public.promociones_tarifa
  for insert with check (public.is_estimaciones());

-- Tarifas, factores, vocabularios y aprobación de promociones:
-- solo administrador del área (o desarrollador).
create policy "admin_estimaciones_insert_catalogos" on public.estimaciones_catalogos
  for insert with check (public.is_admin_area('estimaciones'));
create policy "admin_estimaciones_update_catalogos" on public.estimaciones_catalogos
  for update using (public.is_admin_area('estimaciones')) with check (public.is_admin_area('estimaciones'));
create policy "admin_estimaciones_insert_tarifas_familia" on public.tarifas_familia
  for insert with check (public.is_admin_area('estimaciones'));
create policy "admin_estimaciones_update_tarifas_familia" on public.tarifas_familia
  for update using (public.is_admin_area('estimaciones')) with check (public.is_admin_area('estimaciones'));
create policy "admin_estimaciones_insert_tarifas_proyecto" on public.tarifas_proyecto
  for insert with check (public.is_admin_area('estimaciones'));
create policy "admin_estimaciones_update_tarifas_proyecto" on public.tarifas_proyecto
  for update using (public.is_admin_area('estimaciones')) with check (public.is_admin_area('estimaciones'));
create policy "admin_estimaciones_insert_factores" on public.factores
  for insert with check (public.is_admin_area('estimaciones'));
create policy "admin_estimaciones_update_factores" on public.factores
  for update using (public.is_admin_area('estimaciones')) with check (public.is_admin_area('estimaciones'));
create policy "admin_estimaciones_update_promociones" on public.promociones_tarifa
  for update using (public.is_admin_area('estimaciones')) with check (public.is_admin_area('estimaciones'));

-- ---------------------------------------------------------------------------
-- Datos iniciales — vocabularios
-- ---------------------------------------------------------------------------
insert into public.estimaciones_catalogos (tipo, valor, orden) values
  ('familia', 'Zoclo', 1),
  ('familia', 'Moldura / duela', 2),
  ('familia', 'Entrepaño', 3),
  ('familia', 'Puerta', 4),
  ('familia', 'Marco (lavabo / decorativo)', 5),
  ('familia', 'Cerco / engrosador', 6),
  ('familia', 'Lambrín', 7),
  ('familia', 'Cubierta / table top', 8),
  ('familia', 'Mesa completa', 9),
  ('familia', 'Silla / banca / taburete', 10),
  ('familia', 'Repisa', 11),
  ('familia', 'Barra', 12),
  ('familia', 'Góndola / exhibidor', 13),
  ('familia', 'Cubo / aro decorativo', 14),
  ('familia', 'Pieza decorativa (DEC / CAN)', 15),
  ('familia', 'Panel / mampara', 16),
  ('familia', 'Otro', 17),
  ('acabado', 'Laca Mate', 1),
  ('acabado', 'Laca Semimate', 2),
  ('acabado', 'Laca Brillante', 3),
  ('acabado', 'Laca Especial (Cencerro/Gypso)', 4),
  ('acabado', 'Laca Metálica / Aluminio', 5),
  ('acabado', 'Barniz Mate', 6),
  ('acabado', 'Barniz Semimate', 7),
  ('acabado', 'Barniz Brillante', 8),
  ('acabado', 'Poliuretano Mate', 9),
  ('acabado', 'Tinta / Barniz Especial', 10),
  ('acabado', 'Pintura Directa / Sólido', 11),
  ('acabado', 'Sin acabado', 12),
  -- Las 8 fases reales del histórico (la lista original omitía Resanado y
  -- Pintado). Solo auditoría: no afectan el precio.
  ('fase', 'Limpieza', 1),
  ('fase', 'Resanado', 2),
  ('fase', 'Lijado', 3),
  ('fase', 'Rectificado', 4),
  ('fase', 'Sellado', 5),
  ('fase', 'Premiado', 6),
  ('fase', 'Asentado', 7),
  ('fase', 'Pintado', 8),
  ('causa_reproceso', 'Daño del maquilador', 1),
  ('causa_reproceso', 'Cambio de diseño', 2),
  ('causa_reproceso', 'Daño en traslado', 3),
  ('causa_reproceso', 'Falla de material', 4),
  ('causa_reproceso', 'Rechazo de calidad', 5),
  ('causa_reproceso', 'Otra área', 6),
  ('causa_reproceso', 'Sin determinar', 7);

-- ---------------------------------------------------------------------------
-- Datos iniciales — tarifas
-- ---------------------------------------------------------------------------
insert into public.tarifas_familia (familia, tamano, tarifa, tipo) values
  ('Zoclo', null, 20, 'fija'),
  ('Cerco / engrosador', null, 25, 'fija'),
  ('Cubierta / table top', null, 50, 'fija'),
  ('Moldura / duela', null, 60, 'base'),
  ('Entrepaño', null, 120, 'base'),
  ('Cubo / aro decorativo', null, 180, 'base'),
  ('Góndola / exhibidor', null, 250, 'base'),
  ('Panel / mampara', null, 275, 'base'),
  ('Mesa completa', null, 350, 'base'),
  ('Silla / banca / taburete', null, 400, 'base'),
  ('Marco (lavabo / decorativo)', null, 450, 'base'),
  ('Repisa', null, 450, 'base'),
  ('Puerta', null, 700, 'base'),
  ('Lambrín', null, 1350, 'base');

-- ---------------------------------------------------------------------------
-- Datos iniciales — factores y configuración
-- ---------------------------------------------------------------------------
insert into public.factores (tipo, clave, valor, rango_min, rango_max, descripcion) values
  ('volumen', '1 pieza', 1.00, 1, 1, 'Pieza única'),
  ('volumen', '2 a 3', 0.80, 2, 3, null),
  ('volumen', '4 a 10', 0.70, 4, 10, null),
  ('volumen', 'más de 10', 0.50, 11, null, null),
  ('prioridad', 'normal', 1.00, null, null, null),
  ('prioridad', 'preferente', 1.15, null, null, null),
  ('prioridad', 'urgente', 1.30, null, null, null),
  ('config', 'nivel3_visible', 0, null, null,
    'Mientras sea 0, el nivel 3 (estimado por familia) corre en sombra: se calcula y se guarda, pero al estimador se le presenta como nivel 4 (manual).'),
  ('config', 'recargo_acabado_2', 0, null, null,
    'Recargo cuando una pieza lleva dos acabados DISTINTOS. Arranca en 0 hasta calibrarlo con datos reales.');

-- ---------------------------------------------------------------------------
-- guardar_recibo_acabados: alta atómica de un recibo con sus renglones, o
-- continuación de un folio ya existente (numeración de renglones sigue
-- donde se quedó). security invoker: corre con los permisos de quien llama,
-- así que las políticas de RLS de arriba se siguen aplicando; la validación
-- de is_estimaciones() de aquí solo da un mensaje de error más claro que el
-- genérico de RLS.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_recibo_acabados(
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
  v_siguiente_numero integer;
  r jsonb;
begin
  if not public.is_estimaciones() then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;

  select id into v_recibo_id from public.recibos where folio = p_folio;

  if v_recibo_id is null then
    insert into public.recibos (
      folio, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, capturado_por
    ) values (
      p_folio, p_fecha_recibo, p_contratista, nullif(p_obra, ''), nullif(p_ot, ''),
      p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
    )
    returning id into v_recibo_id;
    v_siguiente_numero := 1;
  else
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    insert into public.renglones (
      recibo_id, numero, modelo, familia, acabado, acabado_2, tipo_trabajo, causa_reproceso,
      cantidad, tamano, fases, pu_sugerido, fuente_sugerido, sin_tamano, pu_propuesto,
      pu_aceptado, banda, justificacion, nota
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
      nullif(r->>'puSugerido', '')::numeric,
      (r->>'fuente')::public.est_fuente_sugerido,
      coalesce((r->>'sinTamano')::boolean, false),
      (r->>'propuesto')::numeric,
      (r->>'aceptado')::numeric,
      (r->>'banda')::public.est_banda,
      nullif(r->>'justificacion', ''),
      nullif(r->>'nota', '')
    );
    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  return v_recibo_id;
end;
$$;

revoke execute on function public.guardar_recibo_acabados(
  text, date, text, text, text, public.est_prioridad, text, jsonb
) from public, anon;
grant execute on function public.guardar_recibo_acabados(
  text, date, text, text, text, public.est_prioridad, text, jsonb
) to authenticated;
