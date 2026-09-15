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
