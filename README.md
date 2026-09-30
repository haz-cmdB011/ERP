# ERP Becario

Sistema empresarial interno (Planeación, Producción, Calidad, Estimaciones,
Finanzas). Fase 1: carga e ingestión de Excel de **Planeación** — el "revisor
de cantidades" que compara cantidades declaradas contra cantidades reales a
lo largo del flujo.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind) — Vercel
- **Supabase** (Postgres + Storage + Auth) — base de datos y autenticación
- **exceljs** — parseo de archivos `.xlsx`

No se usa Render en esta fase: el volumen y tamaño de los archivos de
Planeación no justifica un servicio backend separado. Vercel + Supabase Edge
Functions son suficientes.

## Configuración local

1. Copia `.env.example` a `.env.local` y completa las variables:

   ```bash
   cp .env.example .env.local
   ```

   - `NEXT_PUBLIC_SUPABASE_URL`: Settings → API → Project URL, en el panel de Supabase.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Settings → API → Project API keys (clave publicable/anon).

2. Instala dependencias y levanta el servidor:

   ```bash
   npm install
   npm run dev
   ```

3. Abre [http://localhost:3000](http://localhost:3000). Redirige a `/login`
   (magic link por correo vía Supabase Auth); tras iniciar sesión, lleva a
   `/planeacion/upload`.

## Base de pruebas

El `.env.local` normal apunta a la base de **producción**: lo que se carga o
borra en local afecta los datos reales del equipo. Para probar sin ese riesgo
se usa un proyecto de Supabase aparte (`erp-becario-pruebas`, plan gratuito)
con el mismo esquema:

1. Crear el proyecto en el panel de Supabase (misma organización, región
   `us-east-1`). El plan gratuito permite dos proyectos activos por
   administrador de la organización; si no deja, pausar uno que no se use.
2. Aplicarle el esquema del repo. Las migraciones de `supabase/migrations/`
   reproducen producción completa (incluidos los buckets de Storage):

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-del-proyecto-de-pruebas>
   npx supabase db push
   ```

3. En Authentication → URL Configuration del proyecto de pruebas, agregar
   `http://localhost:3000/**` y la URL de los previews de Vercel a las
   Redirect URLs (el inicio de sesión es con enlace por correo).
4. Crear en Authentication → Users los usuarios de prueba (uno por rol que se
   quiera probar) y asignarles rol y área en la tabla `perfiles`.
5. Guardar las claves del proyecto de pruebas en un `.env.pruebas.local`
   (mismo formato que `.env.example`, no se sube a Git) y copiarlo sobre
   `.env.local` cuando se quiera trabajar contra pruebas; reiniciar
   `npm run dev`.
6. En Vercel → Settings → Environment Variables, poner las claves del
   proyecto de pruebas solo en el entorno **Preview**: así cada Pull Request
   se prueba contra la base de pruebas y solo `main` usa producción.

Las migraciones nuevas se aplican primero en pruebas y, ya revisadas, en
producción.

## Estructura de datos

El esquema vive en `supabase/migrations/`:

- `0001_init_schema.sql` — tablas raíz: `proyectos`, `pedidos`,
  `pedido_versiones` (historial versionado), `cargas_archivo` (auditoría
  genérica de subidas), `planeacion_items` (jerarquía MO/FU),
  `retroalimentaciones` (feedback de Producción/Calidad/Estimaciones/
  Finanzas hacia Planeación) y `revisiones_cantidad` (auditoría del revisor
  de cantidades).
- `0002_ingest_function.sql` — función `ingest_planeacion_version`: inserta
  una versión completa del pedido de forma atómica (todo o nada).
- `0003_storage_bucket.sql` — bucket privado `cargas-excel` para los
  archivos originales subidos.

Solo Planeación está implementada en esta fase; las tablas de
retroalimentación ya existen pero sin UI todavía.

## Módulo de carga de Excel

- `src/lib/planeacion/parser.ts` — parseo y validación estructural del
  Excel "PEDIDO DE MANUFACTURA" (metadata + jerarquía MO/FU). Pura y
  testeable, sin dependencias de Next.js ni Supabase.
- `src/app/api/planeacion/upload/route.ts` — endpoint que recibe el archivo,
  lo valida, lo sube a Storage para auditoría, y llama a la función RPC de
  ingestión.
- `src/app/planeacion/upload/` — UI de carga.

## Deploy

Deploy a Vercel y aplicación de migraciones a producción no se han hecho
todavía — pendiente de confirmación explícita antes de ejecutarse.
