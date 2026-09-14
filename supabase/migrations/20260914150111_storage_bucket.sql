insert into storage.buckets (id, name, public)
values ('cargas-excel', 'cargas-excel', false)
on conflict (id) do nothing;

create policy "authenticated_insert_cargas_excel"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cargas-excel');

create policy "authenticated_select_cargas_excel"
  on storage.objects for select to authenticated
  using (bucket_id = 'cargas-excel');
