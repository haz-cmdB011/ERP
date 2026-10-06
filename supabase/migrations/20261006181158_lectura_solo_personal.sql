-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.is_staff
-- @verifica policy public.pedidos.authenticated_select_pedidos
-- @verifica policy public.perfiles.perfiles_select_all_authenticated
-- @verifica policy public.planeacion_items.authenticated_select_planeacion_items
-- @verifica policy public.informes_calidad.authenticated_select_informes_calidad
-- @verifica policy public.proyectos.authenticated_select_proyectos
-- @verifica function-contiene public.is_staff desarrollador

-- Endurecimiento de seguridad: la lectura de los datos de la empresa (pedidos,
-- proyectos y clientes, ítems, informes de Calidad, folios, planos, perfiles) y
-- las subidas de archivos dejan de estar abiertas a "cualquier sesión que no sea
-- maquilador".
--
-- Antes: el registro público (/api/registro) crea cuentas ya confirmadas con rol
-- 'usuario' (sin asignar), y ese rol pasaba la condición NOT is_maquilador():
-- cualquiera que se registrara podía leer casi todo.
--
-- Ahora: solo lee quien tiene un rol asignado por un administrador
-- (desarrollador, administrador o trabajador, de cualquier área: Producción,
-- Calidad y Estimaciones necesitan ver los pedidos de Planeación). Un 'usuario'
-- recién registrado solo ve su propio perfil hasta que se le asigne rol y área.
-- El maquilador sigue excluido, como antes. Las subidas de Excel e imágenes de
-- pedidos las hace Planeación, así que el INSERT exige is_planeacion().

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('desarrollador', 'administrador', 'trabajador')
  );
$$;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Tablas: SELECT solo para personal con rol asignado
-- ---------------------------------------------------------------------------
alter policy "select_asignaciones_produccion" on public.asignaciones_produccion
  using ((select public.is_staff()));
alter policy "select_entregas_produccion" on public.entregas_produccion
  using ((select public.is_staff()));
alter policy "select_equipos_produccion" on public.equipos_produccion
  using ((select public.is_staff()));

alter policy "authenticated_select_cargas_archivo" on public.cargas_archivo
  using ((select public.is_staff()));
alter policy "authenticated_select_folios_produccion" on public.folios_produccion
  using ((select public.is_staff()));
alter policy "authenticated_select_informes_calidad" on public.informes_calidad
  using ((select public.is_staff()));
alter policy "authenticated_select_pedido_versiones" on public.pedido_versiones
  using ((select public.is_staff()));
alter policy "authenticated_select_pedidos" on public.pedidos
  using ((select public.is_staff()));
alter policy "authenticated_select_planeacion_item_imagenes" on public.planeacion_item_imagenes
  using ((select public.is_staff()));
alter policy "authenticated_select_planeacion_items" on public.planeacion_items
  using ((select public.is_staff()));
alter policy "authenticated_select_planos" on public.planos
  using ((select public.is_staff()));
alter policy "authenticated_select_proyectos" on public.proyectos
  using ((select public.is_staff()));
alter policy "authenticated_select_retroalimentaciones" on public.retroalimentaciones
  using ((select public.is_staff()));
alter policy "authenticated_select_revisiones_cantidad" on public.revisiones_cantidad
  using ((select public.is_staff()));

-- Perfiles: cada quien ve el suyo; el personal con rol ve a todos (nombres).
alter policy "perfiles_select_all_authenticated" on public.perfiles
  using (((select auth.uid()) = id) or (select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Almacenamiento: lectura solo personal; subir Excel e imágenes, solo Planeación
-- ---------------------------------------------------------------------------
alter policy "authenticated_select_cargas_excel" on storage.objects
  using (bucket_id = 'cargas-excel' and (select public.is_staff()));
alter policy "authenticated_select_planeacion_item_imagenes_bucket" on storage.objects
  using (bucket_id = 'planeacion-item-imagenes' and (select public.is_staff()));
alter policy "select_produccion_entregas_bucket" on storage.objects
  using (bucket_id = 'produccion-entregas' and (select public.is_staff()));

alter policy "authenticated_insert_cargas_excel" on storage.objects
  with check (bucket_id = 'cargas-excel' and (select public.is_planeacion()));
alter policy "authenticated_insert_planeacion_item_imagenes_bucket" on storage.objects
  with check (bucket_id = 'planeacion-item-imagenes' and (select public.is_planeacion()));
