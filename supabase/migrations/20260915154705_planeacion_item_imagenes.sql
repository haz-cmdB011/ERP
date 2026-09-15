-- ---------------------------------------------------------------------------
-- planeacion_item_imagenes: imágenes embebidas en la columna IMAGEN del
-- Excel (objetos flotantes anclados a la fila, no valores de celda),
-- extraídas por el parser y subidas a Storage. Un item puede tener varias
-- imágenes: se observaron hasta 6 ancladas sobre una misma fila en
-- archivos reales.
-- ---------------------------------------------------------------------------
create table public.planeacion_item_imagenes (
  id uuid primary key default gen_random_uuid(),
  planeacion_item_id uuid not null references public.planeacion_items(id) on delete cascade,
  storage_path text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_planeacion_item_imagenes_item on public.planeacion_item_imagenes (planeacion_item_id);

alter table public.planeacion_item_imagenes enable row level security;

create policy "authenticated_select_planeacion_item_imagenes" on public.planeacion_item_imagenes
  for select using (auth.role() = 'authenticated');
create policy "planeacion_insert_planeacion_item_imagenes" on public.planeacion_item_imagenes
  for insert with check (public.is_planeacion());
