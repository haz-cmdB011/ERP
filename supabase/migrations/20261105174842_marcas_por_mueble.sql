-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.marcas_taller_produccion.item_id
-- @verifica column public.marcas_taller_produccion.id
-- @verifica constraint public.marcas_taller_produccion.marcas_taller_una_clave_check
-- @verifica constraint public.marcas_taller_produccion.marcas_taller_produccion_item_key
-- @verifica constraint public.marcas_taller_produccion.marcas_taller_produccion_asignacion_key
--
-- La palomita o el tache de la bitácora de taller (marcas_taller_produccion) también va en los
-- muebles que todavía no tienen ninguna asignación: cada mueble (ítem) puede llevar su marca, además
-- de cada asignación. Una fila marca una asignación (asignacion_id) o un mueble (item_id), nunca
-- las dos. La tabla se creó en marcas_taller_produccion y sigue vacía; las políticas no cambian.

alter table public.marcas_taller_produccion drop constraint marcas_taller_produccion_pkey;
alter table public.marcas_taller_produccion add column id uuid not null default gen_random_uuid();
alter table public.marcas_taller_produccion add constraint marcas_taller_produccion_pkey primary key (id);

alter table public.marcas_taller_produccion alter column asignacion_id drop not null;
alter table public.marcas_taller_produccion
  add column item_id uuid references public.planeacion_items(id) on delete cascade;

-- Una marca por asignación y una por mueble (los NULL no chocan entre sí).
alter table public.marcas_taller_produccion
  add constraint marcas_taller_produccion_asignacion_key unique (asignacion_id);
alter table public.marcas_taller_produccion
  add constraint marcas_taller_produccion_item_key unique (item_id);
alter table public.marcas_taller_produccion
  add constraint marcas_taller_una_clave_check check ((asignacion_id is null) <> (item_id is null));
