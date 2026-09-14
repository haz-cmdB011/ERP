-- ============================================================================
-- Roles y permisos por área.
--
-- Roles en public.perfiles.rol:
--   'admin'      -> control total sobre todo el sistema.
--   'planeacion' -> dueño de los datos raíz: puede crear/editar proyectos,
--                   pedidos, versiones e items de Planeación.
--   'area'       -> solo lectura de Planeación; solo puede escribir
--                   retroalimentaciones/cargas de SU área (perfiles.area).
--
-- Un usuario 'area' sin perfiles.area asignado no puede escribir nada
-- (queda bloqueado hasta que un admin le asigne un área) — es el estado
-- por defecto, más seguro que dar acceso amplio a un usuario sin clasificar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Normalizar roles existentes y aplicar el nuevo dominio de valores
-- ---------------------------------------------------------------------------
update public.perfiles set rol = 'admin' where rol = 'usuario';

alter table public.perfiles alter column rol set default 'area';
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('admin', 'planeacion', 'area'));

-- ---------------------------------------------------------------------------
-- 2) Funciones helper para RLS (security definer: evitan recursión de RLS
-- al leer perfiles desde políticas de otras tablas; sin acceso público).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles where id = auth.uid() and rol = 'admin'
  );
$$;

create or replace function public.is_planeacion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles where id = auth.uid() and rol in ('admin', 'planeacion')
  );
$$;

create or replace function public.current_area()
returns public.area_tipo
language sql
stable
security definer
set search_path = ''
as $$
  select area from public.perfiles where id = auth.uid();
$$;

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_planeacion() from public;
revoke execute on function public.current_area() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_planeacion() to authenticated;
grant execute on function public.current_area() to authenticated;
-- El REVOKE FROM PUBLIC no quita el EXECUTE que Postgres otorga a PUBLIC
-- por defecto al crear la función si ya existía un grant implícito previo;
-- se revoca explícitamente de anon para dejar solo a authenticated (RLS
-- necesita que authenticated pueda ejecutarlas dentro de sus políticas).
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_planeacion() from anon;
revoke execute on function public.current_area() from anon;

-- ---------------------------------------------------------------------------
-- 3) Proteger perfiles.rol y perfiles.area: solo un admin puede cambiarlos.
-- Un usuario puede seguir editando su propio nombre_completo (RLS ya lo
-- permite), pero no auto-promoverse.
-- ---------------------------------------------------------------------------
create or replace function public.protect_perfiles_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    if new.rol is distinct from old.rol or new.area is distinct from old.area then
      raise exception 'Solo un administrador puede cambiar rol o área';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_perfiles_privileged_fields on public.perfiles;
create trigger trg_protect_perfiles_privileged_fields
  before update on public.perfiles
  for each row execute function public.protect_perfiles_privileged_fields();

-- Función de uso exclusivo del trigger: sin EXECUTE para ningún rol (el
-- disparo del trigger no depende de privilegios EXECUTE del rol llamante).
revoke execute on function public.protect_perfiles_privileged_fields() from public, anon, authenticated;

create policy "admin_update_any_perfil" on public.perfiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) Planeación (proyectos, pedidos, pedido_versiones, planeacion_items):
-- lectura abierta a cualquier autenticado, escritura solo planeacion/admin.
-- ---------------------------------------------------------------------------
drop policy "authenticated_insert_proyectos" on public.proyectos;
drop policy "authenticated_update_proyectos" on public.proyectos;
create policy "planeacion_insert_proyectos" on public.proyectos
  for insert with check (public.is_planeacion());
create policy "planeacion_update_proyectos" on public.proyectos
  for update using (public.is_planeacion()) with check (public.is_planeacion());

drop policy "authenticated_insert_pedidos" on public.pedidos;
drop policy "authenticated_update_pedidos" on public.pedidos;
create policy "planeacion_insert_pedidos" on public.pedidos
  for insert with check (public.is_planeacion());
create policy "planeacion_update_pedidos" on public.pedidos
  for update using (public.is_planeacion()) with check (public.is_planeacion());

drop policy "authenticated_insert_pedido_versiones" on public.pedido_versiones;
drop policy "authenticated_update_pedido_versiones" on public.pedido_versiones;
create policy "planeacion_insert_pedido_versiones" on public.pedido_versiones
  for insert with check (public.is_planeacion());
create policy "planeacion_update_pedido_versiones" on public.pedido_versiones
  for update using (public.is_planeacion()) with check (public.is_planeacion());

drop policy "authenticated_insert_planeacion_items" on public.planeacion_items;
drop policy "authenticated_update_planeacion_items" on public.planeacion_items;
create policy "planeacion_insert_planeacion_items" on public.planeacion_items
  for insert with check (public.is_planeacion());
create policy "planeacion_update_planeacion_items" on public.planeacion_items
  for update using (public.is_planeacion()) with check (public.is_planeacion());

-- ---------------------------------------------------------------------------
-- 5) cargas_archivo: escritura solo si el área de la carga coincide con la
-- del usuario ('planeacion' requiere rol planeacion/admin; cualquier otra
-- área requiere que perfiles.area coincida), o si es admin.
-- ---------------------------------------------------------------------------
drop policy "authenticated_insert_cargas_archivo" on public.cargas_archivo;
drop policy "authenticated_update_cargas_archivo" on public.cargas_archivo;
create policy "area_insert_cargas_archivo" on public.cargas_archivo
  for insert with check (
    public.is_admin()
    or (area = 'planeacion' and public.is_planeacion())
    or (area <> 'planeacion' and public.current_area()::text = area)
  );
create policy "area_update_cargas_archivo" on public.cargas_archivo
  for update using (
    public.is_admin()
    or (area = 'planeacion' and public.is_planeacion())
    or (area <> 'planeacion' and public.current_area()::text = area)
  ) with check (
    public.is_admin()
    or (area = 'planeacion' and public.is_planeacion())
    or (area <> 'planeacion' and public.current_area()::text = area)
  );

-- ---------------------------------------------------------------------------
-- 6) retroalimentaciones: cada área solo puede escribir la suya.
-- ---------------------------------------------------------------------------
drop policy "authenticated_insert_retroalimentaciones" on public.retroalimentaciones;
drop policy "authenticated_update_retroalimentaciones" on public.retroalimentaciones;
create policy "area_insert_retroalimentaciones" on public.retroalimentaciones
  for insert with check (public.is_admin() or public.current_area() = area);
create policy "area_update_retroalimentaciones" on public.retroalimentaciones
  for update using (public.is_admin() or public.current_area() = area)
  with check (public.is_admin() or public.current_area() = area);

-- ---------------------------------------------------------------------------
-- 7) revisiones_cantidad: es la auditoría central del revisor de
-- cantidades; escritura restringida a planeacion/admin.
-- ---------------------------------------------------------------------------
drop policy "authenticated_insert_revisiones_cantidad" on public.revisiones_cantidad;
drop policy "authenticated_update_revisiones_cantidad" on public.revisiones_cantidad;
create policy "planeacion_insert_revisiones_cantidad" on public.revisiones_cantidad
  for insert with check (public.is_planeacion());
create policy "planeacion_update_revisiones_cantidad" on public.revisiones_cantidad
  for update using (public.is_planeacion()) with check (public.is_planeacion());
