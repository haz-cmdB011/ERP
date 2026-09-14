drop policy "authenticated_all_proyectos" on public.proyectos;
create policy "authenticated_select_proyectos" on public.proyectos
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_proyectos" on public.proyectos
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated_update_proyectos" on public.proyectos
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy "authenticated_all_pedidos" on public.pedidos;
create policy "authenticated_select_pedidos" on public.pedidos
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_pedidos" on public.pedidos
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated_update_pedidos" on public.pedidos
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy "authenticated_all_pedido_versiones" on public.pedido_versiones;
create policy "authenticated_select_pedido_versiones" on public.pedido_versiones
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_pedido_versiones" on public.pedido_versiones
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated_update_pedido_versiones" on public.pedido_versiones
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy "authenticated_all_cargas_archivo" on public.cargas_archivo;
create policy "authenticated_select_cargas_archivo" on public.cargas_archivo
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_cargas_archivo" on public.cargas_archivo
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated_update_cargas_archivo" on public.cargas_archivo
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy "authenticated_all_planeacion_items" on public.planeacion_items;
create policy "authenticated_select_planeacion_items" on public.planeacion_items
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_planeacion_items" on public.planeacion_items
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated_update_planeacion_items" on public.planeacion_items
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy "authenticated_all_retroalimentaciones" on public.retroalimentaciones;
create policy "authenticated_select_retroalimentaciones" on public.retroalimentaciones
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_retroalimentaciones" on public.retroalimentaciones
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated_update_retroalimentaciones" on public.retroalimentaciones
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy "authenticated_all_revisiones_cantidad" on public.revisiones_cantidad;
create policy "authenticated_select_revisiones_cantidad" on public.revisiones_cantidad
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_revisiones_cantidad" on public.revisiones_cantidad
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated_update_revisiones_cantidad" on public.revisiones_cantidad
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
