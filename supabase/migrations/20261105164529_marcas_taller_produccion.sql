-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.marcas_taller_produccion
-- @verifica column public.marcas_taller_produccion.esta
-- @verifica policy public.marcas_taller_produccion.select_marcas_taller_produccion
-- @verifica policy public.marcas_taller_produccion.produccion_insert_marcas_taller_produccion
-- @verifica policy public.marcas_taller_produccion.produccion_update_marcas_taller_produccion
-- @verifica policy public.marcas_taller_produccion.produccion_delete_marcas_taller_produccion
--
-- Bitácora de taller del inicio de Producción: cada asignación puede llevar una marca que
-- elige quien trabaja en Producción, palomita (esta = true: el mueble sí está en el taller
-- del equipo) o tache (esta = false: no está). Sin fila, la asignación está sin marcar.
-- La marca es solo informativa: no cambia estados, cantidades ni cobros.

create table public.marcas_taller_produccion (
  asignacion_id uuid primary key references public.asignaciones_produccion(id) on delete cascade,
  esta boolean not null,
  marcado_por uuid references auth.users(id) default auth.uid(),
  marcado_en timestamptz not null default now()
);
create index idx_marcas_taller_produccion_marcado_por on public.marcas_taller_produccion (marcado_por);

alter table public.marcas_taller_produccion enable row level security;
-- La ve todo el personal interno (no los maquiladores externos ni un usuario sin rol).
create policy "select_marcas_taller_produccion" on public.marcas_taller_produccion
  for select to authenticated using ((select public.is_staff()));
-- La eligen quienes trabajan en Producción (y el desarrollador).
create policy "produccion_insert_marcas_taller_produccion" on public.marcas_taller_produccion
  for insert to authenticated with check ((select public.is_produccion()));
create policy "produccion_update_marcas_taller_produccion" on public.marcas_taller_produccion
  for update to authenticated
  using ((select public.is_produccion()))
  with check ((select public.is_produccion()));
-- Quitar la marca (volver a "sin marcar") borra la fila.
create policy "produccion_delete_marcas_taller_produccion" on public.marcas_taller_produccion
  for delete to authenticated using ((select public.is_produccion()));
