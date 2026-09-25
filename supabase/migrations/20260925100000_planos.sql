-- ---------------------------------------------------------------------------
-- planos: planos PDF de Ingeniería, sincronizados desde el servidor
-- (I:\O. T´s. <AÑO>\<PM>\INGENIERIA\<MODELO>\PLANOS\*.pdf) por el script
-- scripts/planos/sincronizar-planos.mts. Un registro por archivo PDF.
--
-- Solo el script escribe (con la service_role, que salta RLS): no hay
-- políticas de insert/update/delete para usuarios. Cualquier usuario con
-- sesión puede leerlos.
-- ---------------------------------------------------------------------------
create table public.planos (
  id uuid primary key default gen_random_uuid(),
  -- Ruta del PDF relativa a la raíz de Ingeniería (I:\); identifica el
  -- archivo entre sincronizaciones.
  ruta_origen text not null unique,
  anio smallint not null,
  carpeta_proyecto text not null,
  -- "PM009-26" (formato canónico, ver normalizarNumeroPM); null en
  -- carpetas de proyecto sin número de PM.
  pm text,
  modelo_carpeta text not null,
  -- Nombre de la carpeta del modelo normalizado (ver normalizarModelo):
  -- contra esto se busca el modelo de cada ítem del PM.
  modelo_normalizado text not null,
  -- La carpeta del modelo está marcada "CANCELADA" en el servidor.
  cancelada boolean not null default false,
  nombre_archivo text not null,
  -- Objeto en el bucket "planos", nombrado por el hash del contenido: un
  -- mismo PDF copiado en varios PM se guarda una sola vez.
  storage_path text not null,
  sha256 text not null,
  tamano_bytes bigint not null,
  -- Fecha de modificación del archivo en el servidor: si no cambia (junto
  -- con el tamaño), el script no vuelve a leer ni subir el archivo.
  modificado_en timestamptz not null,
  sincronizado_en timestamptz not null default now()
);

create index idx_planos_pm on public.planos (pm);
create index idx_planos_modelo_normalizado on public.planos (modelo_normalizado);
create index idx_planos_storage_path on public.planos (storage_path);

alter table public.planos enable row level security;

create policy "authenticated_select_planos" on public.planos
  for select using ((select auth.role()) = 'authenticated');

-- Bucket privado: los PDF se sirven con URLs firmadas de corta duración.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('planos', 'planos', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create policy "authenticated_select_planos_bucket"
  on storage.objects for select to authenticated
  using (bucket_id = 'planos');
