-- Advisors de rendimiento.

-- 1) Índices para las 11 llaves foráneas sin índice de cobertura (lint 0001).
create index if not exists idx_cargas_archivo_cargado_por on public.cargas_archivo (cargado_por);
create index if not exists idx_informes_calidad_elaborado_por on public.informes_calidad (elaborado_por);
create index if not exists idx_pedido_versiones_carga_id on public.pedido_versiones (carga_id);
create index if not exists idx_pedidos_cancelado_por on public.pedidos (cancelado_por);
create index if not exists idx_pedidos_eliminado_por on public.pedidos (eliminado_por);
create index if not exists idx_planeacion_items_eliminacion_solicitada_por
  on public.planeacion_items (eliminacion_solicitada_por);
create index if not exists idx_planeacion_items_liberado_por on public.planeacion_items (liberado_por);
create index if not exists idx_retroalimentaciones_carga_id on public.retroalimentaciones (carga_id);
create index if not exists idx_retroalimentaciones_reportado_por on public.retroalimentaciones (reportado_por);
create index if not exists idx_revisiones_cantidad_retroalimentacion_id
  on public.revisiones_cantidad (retroalimentacion_id);
create index if not exists idx_revisiones_cantidad_revisado_por on public.revisiones_cantidad (revisado_por);

-- 2) RLS initplan (lint 0003): envolver auth.role()/auth.uid() en (select ...)
-- para que se evalúen una vez por consulta y no una vez por fila. La lógica de
-- cada política es idéntica; solo cambia cómo se evalúa.
alter policy "authenticated_select_cargas_archivo" on public.cargas_archivo
  using ((select auth.role()) = 'authenticated');
alter policy "authenticated_select_folios_produccion" on public.folios_produccion
  using ((select auth.role()) = 'authenticated');
alter policy "authenticated_select_informes_calidad" on public.informes_calidad
  using ((select auth.role()) = 'authenticated');
alter policy "authenticated_select_pedido_versiones" on public.pedido_versiones
  using ((select auth.role()) = 'authenticated');
alter policy "authenticated_select_pedidos" on public.pedidos
  using ((select auth.role()) = 'authenticated');
alter policy "authenticated_select_planeacion_item_imagenes" on public.planeacion_item_imagenes
  using ((select auth.role()) = 'authenticated');
alter policy "authenticated_select_planeacion_items" on public.planeacion_items
  using ((select auth.role()) = 'authenticated');
alter policy "authenticated_select_proyectos" on public.proyectos
  using ((select auth.role()) = 'authenticated');
alter policy "authenticated_select_retroalimentaciones" on public.retroalimentaciones
  using ((select auth.role()) = 'authenticated');
alter policy "authenticated_select_revisiones_cantidad" on public.revisiones_cantidad
  using ((select auth.role()) = 'authenticated');

alter policy "perfiles_select_all_authenticated" on public.perfiles
  using ((select auth.role()) = 'authenticated');
alter policy "perfiles_insert_own" on public.perfiles
  with check ((select auth.uid()) = id);
alter policy "perfiles_update_own" on public.perfiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
