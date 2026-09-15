-- protect_perfiles_privileged_fields bloqueaba también las llamadas hechas
-- con el service_role key (ej. POST /api/admin/usuarios/crear, que usa
-- createAdminClient() para asignar el rol elegido al crear el usuario):
-- is_admin() depende de auth.uid(), que no existe en ese contexto, así que
-- CUALQUIER rol distinto al default 'area' fallaba silenciosamente al
-- crear el usuario. Se permite también cuando la llamada viene con el JWT
-- de service_role (nunca expuesto al cliente, solo usado server-side).
create or replace function public.protect_perfiles_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    if new.rol is distinct from old.rol or new.area is distinct from old.area then
      raise exception 'Solo un administrador puede cambiar rol o área';
    end if;
  end if;
  return new;
end;
$$;
