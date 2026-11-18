-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.avisos
-- @verifica table public.avisos_leidos
-- @verifica column public.avisos.clave
-- @verifica index public.idx_avisos_clave
-- @verifica policy public.avisos.select_avisos
-- @verifica policy public.avisos_leidos.select_avisos_leidos
-- @verifica policy public.avisos_leidos.insert_avisos_leidos
-- @verifica policy public.avisos_leidos.delete_avisos_leidos
--
-- Recrea las tablas `avisos` y `avisos_leidos`, que se borraron a mano desde el panel de Supabase
-- (18 nov 2026) al intentar vaciar la base. Es la misma definición de las migraciones avisos_por_area
-- y avisos_recordatorios, sin los datos: los triggers y funciones de avisos nunca se borraron, así que
-- en cuanto existan las tablas vuelven a funcionar la campanita, los avisos y los recordatorios.
-- Es idempotente: si las tablas ya existen, no cambia nada.

create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('planeacion', 'produccion', 'calidad', 'estimaciones')),
  destinatario_id uuid references auth.users(id) on delete cascade,
  tipo text not null check (char_length(tipo) <= 40),
  titulo text not null check (char_length(titulo) <= 80),
  cuerpo text not null default '' check (char_length(cuerpo) <= 200),
  url text check (url is null or (char_length(url) <= 300 and url like '/%' and url not like '//%')),
  creado_por uuid references auth.users(id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now(),
  push_enviado_en timestamptz,
  clave text check (clave is null or char_length(clave) <= 120)
);
create index if not exists idx_avisos_area_fecha on public.avisos (area, creado_en desc);
create index if not exists idx_avisos_destinatario_fecha on public.avisos (destinatario_id, creado_en desc) where destinatario_id is not null;
create index if not exists idx_avisos_creado_por on public.avisos (creado_por) where push_enviado_en is null;
create unique index if not exists idx_avisos_clave on public.avisos (clave) where clave is not null;

create table if not exists public.avisos_leidos (
  aviso_id uuid not null references public.avisos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  leido_en timestamptz not null default now(),
  primary key (aviso_id, user_id)
);
create index if not exists idx_avisos_leidos_usuario on public.avisos_leidos (user_id);

alter table public.avisos enable row level security;
alter table public.avisos_leidos enable row level security;

-- Los avisos solo los escriben los triggers (y el servidor con la clave de servicio): no hay política
-- de alta, edición ni baja para la app.
drop policy if exists "select_avisos" on public.avisos;
create policy "select_avisos" on public.avisos
  for select to authenticated using ((select public.aviso_visible(area, destinatario_id)));

-- Cada persona marca como leídos solo los avisos que puede ver, y solo a su nombre.
drop policy if exists "select_avisos_leidos" on public.avisos_leidos;
create policy "select_avisos_leidos" on public.avisos_leidos
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "insert_avisos_leidos" on public.avisos_leidos;
create policy "insert_avisos_leidos" on public.avisos_leidos
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.avisos a where a.id = aviso_id)
  );
drop policy if exists "delete_avisos_leidos" on public.avisos_leidos;
create policy "delete_avisos_leidos" on public.avisos_leidos
  for delete to authenticated using (user_id = (select auth.uid()));
