-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.suscripciones_push
-- @verifica column public.suscripciones_push.endpoint
-- @verifica policy public.suscripciones_push.select_suscripciones_push
-- @verifica policy public.suscripciones_push.insert_suscripciones_push
-- @verifica policy public.suscripciones_push.delete_suscripciones_push
--
-- Notificaciones al celular (Web Push): cada aparato que activa las notificaciones deja aquí su suscripción
-- (la dirección que le dio el navegador y las dos llaves para cifrar el aviso). Una persona puede tener varios
-- aparatos; un aparato pertenece a una sola persona (`endpoint` único). Quien manda los avisos es el servidor,
-- con la clave de servicio (bypassa RLS); desde la app, cada persona solo ve, agrega y quita las suyas.
-- Las llaves p256dh y auth permiten mandarle avisos a ese aparato: por eso nadie más las puede leer.

create table public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique check (char_length(endpoint) <= 1024),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 80),
  -- Para saber de qué aparato es (por ejemplo "Chrome en Android"); solo informativo.
  user_agent text check (char_length(user_agent) <= 300),
  creada_en timestamptz not null default now()
);
create index idx_suscripciones_push_usuario on public.suscripciones_push (user_id);

alter table public.suscripciones_push enable row level security;
-- Cada persona ve, agrega y quita solo sus aparatos. No hay política de edición: se quita y se vuelve a agregar.
create policy "select_suscripciones_push" on public.suscripciones_push
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert_suscripciones_push" on public.suscripciones_push
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "delete_suscripciones_push" on public.suscripciones_push
  for delete to authenticated using (user_id = (select auth.uid()));

-- Para deshacer: drop table public.suscripciones_push;
