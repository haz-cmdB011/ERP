insert into storage.buckets (id, name, public)
values ('planeacion-item-imagenes', 'planeacion-item-imagenes', false)
on conflict (id) do nothing;

create policy "authenticated_insert_planeacion_item_imagenes_bucket"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'planeacion-item-imagenes');

create policy "authenticated_select_planeacion_item_imagenes_bucket"
  on storage.objects for select to authenticated
  using (bucket_id = 'planeacion-item-imagenes');
