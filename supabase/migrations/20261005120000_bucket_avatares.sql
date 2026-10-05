-- Bucket privado para las fotos de perfil. Sin políticas a propósito: solo el
-- servidor (service role) sube, borra y firma URLs de este bucket, siempre en
-- la carpeta del propio usuario (ver src/lib/cuenta/avatar.ts y
-- src/app/api/cuenta/foto). La app también lo crea sola si falta, así que esta
-- migración solo deja constancia en el repo; es idempotente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', false, 2097152, array['image/webp'])
on conflict (id) do nothing;
