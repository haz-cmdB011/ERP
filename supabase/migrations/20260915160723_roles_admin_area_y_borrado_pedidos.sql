-- ============================================================================
-- Roles: 'admin' pasa a significar "desarrollador" (acceso global sin
-- restricción de área, reservado para el equipo técnico). Se agregan roles
-- de "admin de área" (admin_planeacion, admin_produccion, admin_calidad,
-- admin_estimaciones, admin_finanzas) que solo tienen privilegios elevados
-- dentro de su propia área — hoy, en concreto, poder eliminar pedidos (PM)
-- de Planeación.
-- ============================================================================

-- El constraint viejo no permite los valores nuevos: hay que quitarlo antes
-- de renombrar las filas existentes.
alter table public.perfiles drop constraint perfiles_rol_check;

-- trg_protect_perfiles_privileged_fields exige is_admin() para cambiar
-- `rol`, pero is_admin() se evalúa contra auth.uid() de quien ejecuta la
-- migración (sin sesión de usuario real) y siempre da false aquí: se
-- desactiva el trigger solo para este UPDATE puntual de datos.
alter table public.perfiles disable trigger trg_protect_perfiles_privileged_fields;
update public.perfiles set rol = 'desarrollador' where rol = 'admin';
alter table public.perfiles enable trigger trg_protect_perfiles_privileged_fields;

alter table public.perfiles add constraint perfiles_rol_check
  check (rol in (
    'desarrollador',
    'admin_planeacion', 'admin_produccion', 'admin_calidad', 'admin_estimaciones', 'admin_finanzas',
    'planeacion', 'area'
  ));

-- is_admin(): ahora significa "desarrollador". Se mantiene el nombre de la
-- función porque ya la usan la mayoría de las políticas RLS existentes.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles where id = auth.uid() and rol = 'desarrollador'
  );
$$;

-- is_planeacion(): un admin_planeacion también debe poder hacer todo lo que
-- hace un usuario normal de planeación (cargar Excel, etc.), además de
-- poder eliminar — eso último lo decide is_admin_planeacion() más abajo.
create or replace function public.is_planeacion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('desarrollador', 'planeacion', 'admin_planeacion')
  );
$$;

create or replace function public.is_admin_planeacion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('desarrollador', 'admin_planeacion')
  );
$$;

-- Genérico para las áreas operativas (producción, calidad, estimaciones,
-- finanzas), que comparten el enum area_tipo: cubre lo mismo que
-- is_admin_planeacion() pero parametrizado por área, para cuando esas áreas
-- tengan sus propios recursos eliminables.
create or replace function public.is_admin_area(p_area public.area_tipo)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid()
      and (rol = 'desarrollador' or rol = 'admin_' || p_area::text)
  );
$$;

revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_planeacion() from anon;
revoke execute on function public.is_admin_planeacion() from public, anon;
revoke execute on function public.is_admin_area(public.area_tipo) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_planeacion() to authenticated;
grant execute on function public.is_admin_planeacion() to authenticated;
grant execute on function public.is_admin_area(public.area_tipo) to authenticated;

-- ---------------------------------------------------------------------------
-- Borrado de pedidos (PM) de Planeación: se ofrecen las dos modalidades.
-- Lógico (por defecto, conserva el historial para auditoría) y definitivo
-- (borra en cascada versiones/items/imágenes). Ambos restringidos a
-- desarrollador o admin_planeacion.
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column eliminado_en timestamptz,
  add column eliminado_por uuid references auth.users(id);

-- Nunca existió una política de DELETE en esta tabla (harden_rls_no_delete
-- las quitó todas a propósito). Esta es la primera, acotada a admins.
create policy "planeacion_admin_delete_pedidos" on public.pedidos
  for delete using (public.is_admin() or public.is_admin_planeacion());

create or replace function public.soft_delete_pedido(p_pedido_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.is_admin_planeacion()) then
    raise exception 'No tienes permiso para eliminar este pedido.';
  end if;

  update public.pedidos
    set eliminado_en = now(), eliminado_por = auth.uid(), estado = 'eliminado'
    where id = p_pedido_id;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;
end;
$$;

create or replace function public.restore_pedido(p_pedido_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.is_admin_planeacion()) then
    raise exception 'No tienes permiso para restaurar este pedido.';
  end if;

  update public.pedidos
    set eliminado_en = null, eliminado_por = null, estado = 'activo'
    where id = p_pedido_id;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;
end;
$$;

revoke execute on function public.soft_delete_pedido(uuid) from public, anon;
revoke execute on function public.restore_pedido(uuid) from public, anon;
grant execute on function public.soft_delete_pedido(uuid) to authenticated;
grant execute on function public.restore_pedido(uuid) to authenticated;
