-- ---------------------------------------------------------------------------
-- planos: especificaciones de los planos PDF de Ingeniería, leídas del
-- cuadro de datos por el script scripts/planos/sincronizar-planos.mts desde
-- el servidor (\\192.168.120.100\ingenieria\O. T´s. <AÑO>\<PM>\INGENIERIA\
-- <MODELO>\PLANOS\*.pdf). Un registro por archivo PDF.
--
-- Los PDF NO se guardan en Supabase (ni en Storage ni aquí): solo sus datos
-- y su ruta, para abrirlos directamente desde el servidor de la empresa.
--
-- Solo el script escribe (con la service_role, que salta RLS): no hay
-- políticas de insert/update/delete para usuarios. Cualquier usuario con
-- sesión puede leerlos.
-- ---------------------------------------------------------------------------
create table public.planos (
  id uuid primary key default gen_random_uuid(),
  -- Ruta del PDF relativa a la raíz de Ingeniería del servidor, con "\";
  -- identifica el archivo entre sincronizaciones.
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
  tamano_bytes bigint not null,
  -- Fecha de modificación del archivo en el servidor: si no cambia (junto
  -- con el tamaño), el script no vuelve a leer el PDF.
  modificado_en timestamptz not null,

  -- Especificaciones leídas del cuadro de datos de la primera hoja (ver
  -- src/lib/planos/cuadro-datos.ts). Cualquiera puede venir vacía: hay
  -- varias plantillas del cuadro y no todas llenan todos los campos.
  paginas integer,
  especificacion text,
  descripcion text,
  proyecto text,
  pm_plano text,
  dibujo text,
  verifico text,
  fecha_plano text,
  escala text,
  -- Códigos de acabado mencionados en el plano (LP-A, MT-72, PT-191...).
  acabados text[] not null default '{}',
  -- Anotaciones del dibujo fuera del cuadro ("FABRICAR 23 PZ", ...).
  notas text[] not null default '{}',
  -- Texto de todas las hojas (recortado), para búsquedas.
  texto text,
  -- Si el PDF no se pudo leer (dañado, protegido...), el motivo.
  error_lectura text,

  sincronizado_en timestamptz not null default now()
);

create index idx_planos_pm on public.planos (pm);
create index idx_planos_modelo_normalizado on public.planos (modelo_normalizado);

alter table public.planos enable row level security;

create policy "authenticated_select_planos" on public.planos
  for select using ((select auth.role()) = 'authenticated');
