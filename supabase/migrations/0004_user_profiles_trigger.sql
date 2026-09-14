-- ============================================================================
-- Crea automáticamente una fila en public.perfiles cuando se registra un
-- usuario en auth.users, guardando su email para poder mostrarlo en la UI
-- (ej. "quién cargó" un pedido) sin exponer auth.users directamente.
-- ============================================================================
alter table public.perfiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill de usuarios que ya existían antes de este trigger
insert into public.perfiles (id, email)
select id, email from auth.users
on conflict (id) do update set email = excluded.email;

-- Postgres otorga EXECUTE a PUBLIC por defecto al crear una función. Como
-- esta vive en el esquema public (expuesto por PostgREST), quedaría
-- invocable como RPC pública sin necesidad de sesión. Se revoca: solo debe
-- correr como trigger, con los privilegios de su dueño.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;
