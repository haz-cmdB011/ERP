-- ============================================================================
-- Simplifica el catálogo de roles a 4 valores genéricos combinados con el
-- área (que ahora incluye 'planeacion'): desarrollador (global, sin área),
-- administrador (todo dentro de su área, incluido borrar), trabajador
-- (operación normal dentro de su área) y usuario (solo lectura). Reemplaza
-- los roles admin_<área> de la migración anterior, que quedaban por fuera
-- de la lista de 4 roles pedida.
-- ============================================================================

alter table public.perfiles drop constraint perfiles_rol_check;

alter table public.perfiles disable trigger trg_protect_perfiles_privileged_fields;

update public.perfiles set rol = 'administrador', area = 'planeacion' where rol = 'admin_planeacion';
update public.perfiles set rol = 'administrador', area = 'produccion' where rol = 'admin_produccion';
update public.perfiles set rol = 'administrador', area = 'calidad' where rol = 'admin_calidad';
update public.perfiles set rol = 'administrador', area = 'estimaciones' where rol = 'admin_estimaciones';
update public.perfiles set rol = 'administrador', area = 'finanzas' where rol = 'admin_finanzas';
update public.perfiles set rol = 'trabajador', area = 'planeacion' where rol = 'planeacion';
update public.perfiles set rol = 'trabajador' where rol = 'area';

alter table public.perfiles enable trigger trg_protect_perfiles_privileged_fields;

alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('desarrollador', 'administrador', 'trabajador', 'usuario'));

-- El default anterior era 'area' (ya inválido): sin este cambio, el
-- trigger on_auth_user_created (que inserta en perfiles solo con id+email,
-- dejando `rol` en su valor por defecto) rompería la creación de CUALQUIER
-- usuario nuevo al violar el check constraint de arriba.
alter table public.perfiles alter column rol set default 'usuario';

-- Todo rol que no sea desarrollador queda ligado a un área específica.
alter table public.perfiles add constraint perfiles_area_requerida_check
  check (rol = 'desarrollador' or area is not null);

-- Las funciones de más abajo (is_planeacion, is_admin_planeacion,
-- is_admin_area) mantienen su nombre y firma a propósito: ya las usan las
-- políticas RLS de proyectos/pedidos/pedido_versiones/planeacion_items/
-- cargas_archivo y las funciones soft_delete_pedido/restore_pedido, y no
-- hace falta tocar nada de eso — solo cambia el vocabulario de roles por
-- debajo.
create or replace function public.is_admin_area(p_area public.area_tipo)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'administrador' and area = p_area
  );
$$;

create or replace function public.is_admin_planeacion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin_area('planeacion');
$$;

create or replace function public.is_planeacion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('administrador', 'trabajador') and area = 'planeacion'
  );
$$;

revoke execute on function public.is_admin_area(public.area_tipo) from public, anon;
revoke execute on function public.is_admin_planeacion() from public, anon;
revoke execute on function public.is_planeacion() from anon;
grant execute on function public.is_admin_area(public.area_tipo) to authenticated;
grant execute on function public.is_admin_planeacion() to authenticated;
grant execute on function public.is_planeacion() to authenticated;
