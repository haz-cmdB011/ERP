@AGENTS.md

# ERP Becario (Mobiliarium)

Sistema interno por áreas: Planeación, Producción, Calidad, Estimaciones y
Finanzas. Interfaz y datos en español. Más detalle de arquitectura y modelo de
datos en `README.md`.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind 4) desplegado en Vercel.
- Supabase: Postgres, Auth (magic link), Storage. Acceso controlado por RLS.
- `exceljs` para leer Excel (incluye `.xlsm`), `jspdf` + `html2canvas-pro` para
  PDF, `sharp` para imágenes, `pdfjs-dist` para planos.
- Tests con Vitest.

## Comandos

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
npm test        # vitest run
```

Scripts de planos (Node con `tsx`): `scripts/planos/*.mts`.

## Variables de entorno (`.env.local`, no se sube a Git)

Copiar `.env.example` y completar. Cada valor va en su variable:

- `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto (`https://<ref>.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: clave **publishable** (`sb_publishable_...`).
- `SUPABASE_SERVICE_ROLE_KEY`: clave **secret** (`sb_secret_...`). Solo servidor,
  nunca con prefijo `NEXT_PUBLIC_`; bypassa RLS.

Next solo lee el archivo al arrancar: reiniciar `npm run dev` tras cambiarlo.
Ese `.env.local` apunta al Supabase de **producción**, que comparte el equipo:
lo que se cargue o borre en local afecta datos reales.

## Estructura

- `src/app/<area>/`: pantallas por área (`planeacion`, `produccion`, `calidad`,
  `estimaciones`, `admin`) más `login`, `auth/callback` y `registro`.
- `src/app/api/`: rutas de servidor (`admin`, `planeacion`, `produccion`,
  `registro`).
- `src/proxy.ts`: refresca la sesión de Supabase en cada request
  (`src/lib/supabase/middleware.ts`).
- `src/lib/supabase/`: clientes `client`, `server` y `admin` (service role).
- `src/lib/auth/`: perfil actual, guard de admin y definición de roles.
- `src/lib/planeacion/`: parser del Excel "PEDIDO DE MANUFACTURA", números PM,
  jerarquía MO/FU, imágenes.
- `src/lib/estimaciones/`: motor de precios, recibos de acabados, armado y
  electrificación, revisión.
- `src/lib/planos/`, `src/lib/pdf/`, `src/lib/produccion/`: planos, PDF tamaño
  carta y búsqueda de muebles.
- `supabase/migrations/`: esquema versionado. Los números de versión deben
  coincidir con `supabase_migrations.schema_migrations` del proyecto.

## Roles y áreas

Roles: `desarrollador` (acceso global), `administrador` y `trabajador` (ligados a
un área), `usuario` (sin asignar), `maquilador` (externo, siempre de
Estimaciones, con contratista y una o más áreas de maquila: acabados, armado,
electrificación). Definidos en `src/lib/auth/roles.ts`. Las reglas reales viven
en RLS y funciones SQL (`is_admin`, `is_admin_planeacion`, `is_admin_area`,
`puede_capturar_tipo`); la UI no basta como control de acceso.

## Convenciones de trabajo

- Cambios de esquema: siempre como archivo nuevo en `supabase/migrations/`,
  nunca aplicar SQL en Supabase sin guardarlo en el repo (ya pasó que quedaron
  migraciones solo en la base y hubo que recuperarlas).
- Flujo con el equipo: rama propia, Pull Request a `main`; al fusionar en `main`
  Vercel despliega. Hacer `git pull` antes de empezar.
- No subir `.env*` ni `.scratch/`.
- Antes de tocar Next.js, leer la guía correspondiente en
  `node_modules/next/dist/docs/` (ver AGENTS.md).
- Correr `npm test` y `npm run lint` antes de abrir un PR. GitHub Actions
  (`.github/workflows/ci.yml`) los vuelve a correr en cada PR junto con el
  build; no fusionar si sale en rojo.
