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
