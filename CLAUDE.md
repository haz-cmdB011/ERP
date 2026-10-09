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
npm run test:e2e     # pruebas de navegador (Playwright); antes: npm run build
npm run test:db      # pruebas de la base de Supabase (solo lectura, usa .env.local)
npm run db:verificar # genera la consulta que compara migraciones del repo vs la base
```

Scripts de planos (Node con `tsx`): `scripts/planos/*.mts`.

`npm run test:db` corre `tests-db/` contra la base REAL (nunca escribe): funciones
puras, permisos que deben rechazarse y la regla de que la cantidad de una OT (todos
sus PM) sale solo de los muebles padre. Los casos con datos (TIRAS DE ROSA MORADO
en la OT 102-24 = 119…) se omiten con aviso si esa OT no está cargada. No corre con
`npm test`.

## Documentación del equipo

`docs/onboarding.md` (guía para quien entra), `docs/operacion.md` (qué hacer si algo falla: avisos,
monitor `/api/salud`, accesos, restauración) y `SEGURIDAD.md`.

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
- `src/lib/offline/`: cola de capturas sin conexión (ver abajo).
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

## Migraciones: cómo aplicarlas

El historial de Supabase (`supabase_migrations.schema_migrations`) **no basta**
para saber si una migración se ejecutó: ya pasó que una quedó registrada sin
crearse (auditoría de recibos) y que otras se aplicaron en la base sin archivo
en el repo. Por eso:

1. Crear `supabase/migrations/<AAAAMMDDHHMMSS>_<nombre>.sql`. Al inicio, declarar
   los objetos que debe dejar con comentarios `-- @verifica <tipo> <nombre>`
   (tipos: `function`, `function-contiene`, `sin-function`, `trigger`, `column`,
   `table`, `policy`, `constraint`; ver `scripts/db/verificar-migraciones.mjs`).
2. Aplicarla por **una sola vía**, que registra el historial por sí misma:
   `apply_migration` de Supabase (desde Claude, con permiso explícito) o la CLI
   (`supabase login`, `supabase link --project-ref cydhyndflldnswzquzjx`,
   `supabase db push`). Evitar pegar en el SQL Editor y registrar aparte con un
   `insert`: es justo lo que dejó registros sin ejecutar.
3. Verificar: `npm run db:verificar` (o `-- --desde=20260930` para las recientes)
   imprime una consulta de solo lectura; ejecutarla en Supabase. Todas las filas
   deben decir `OK`.
4. Si sale `SOLO_EN_LA_BASE`: alguien aplicó una migración sin archivo. Buscar su
   archivo en la rama de quien la hizo o recuperarla con
   `select statements from supabase_migrations.schema_migrations where version = '...'`
   y guardarla en el repo.

## Verificación de Producción (apagada por ahora)

La preaprobación de Producción (el trabajador "verifica" una entrega para mandarla a Calidad) está
APAGADA con el ajuste `verificacion_produccion` de la tabla `ajustes_flujo`
(migración `calidad_sin_verificacion_produccion`). Mientras esté apagada: Calidad evalúa todo ítem
liberado a producción, haya o no entregas (un mueble sin entregas se aprueba o no aprueba completo;
con entregas se sigue evaluando por lote) y las entregas nuevas nacen ya verificadas. Para volver al
flujo con verificación:

```sql
update public.ajustes_flujo set activo = true, actualizado_en = now()
  where clave = 'verificacion_produccion';
```

La pantalla lee el ajuste con `src/lib/calidad/ajustes-flujo.ts`; si no puede leerlo asume el flujo con
verificación.

## Capturas sin conexión

En el taller a veces se cae el Wi-Fi. La **entrega de Producción** (con su foto) se guarda en el
propio aparato (IndexedDB) si no hay red y se manda sola al volver, con un indicador en pantalla
(`EstadoEnvios`, en el layout raíz). Núcleo en `src/lib/offline/cola-envios.ts` (sin navegador, con
pruebas), almacén en `almacen-indexeddb.ts`, pegamento del navegador en `cola-navegador.ts`.

- **Repetir un envío nunca duplica**: cada captura lleva una `claveEnvio`; el servidor sube la foto a
  una ruta que sale de ella y el índice único `idx_entregas_produccion_foto_path_unica` impide
  registrar la entrega dos veces (`src/app/api/produccion/entregas/route.ts`).
- Para llevar **otra captura** a la cola: que su ruta de servidor acepte `claveEnvio` y sea idempotente
  (si la operación crea algo, la clave debe identificarlo de forma única) y mandarla con
  `enviarOGuardar` en vez de `fetch`. No encolar lo que no sea seguro repetir.
- Solo se manda con la **misma sesión** que capturó (el servidor registra a quien esté dentro).
- Hoy NO cubre: abrir pantallas nuevas sin red (el escáner de QR y el detalle de cada mueble necesitan
  conexión para cargar), ni Calidad ni Estimaciones.

## Seguridad

Ver `SEGURIDAD.md`: capas de defensa, variables opcionales (`REGISTRO_DOMINIOS_PERMITIDOS`,
`NEXT_PUBLIC_SITE_URL`, `CSP_SOLO_REPORTE`) y pasos manuales en Supabase/Vercel. Reglas que no
hay que romper: la lectura de datos exige rol asignado (`is_staff()`; un `usuario` recién
registrado no ve nada), las imágenes se validan por su contenido real antes de `sharp`
(`src/lib/seguridad/imagen.ts`), `?next=` solo acepta rutas internas
(`src/lib/seguridad/redireccion.ts`) y toda tabla nueva lleva RLS desde su migración.

## Contraseñas filtradas

Se comprueban en la app contra Pwned Passwords (k-anonimato: solo sale el prefijo
de 5 caracteres del hash SHA-1; ver `src/lib/auth/contrasena-filtrada.ts`) al
crear usuarios, restablecer contraseñas, registrarse y cambiar la propia. Si el
servicio no responde no bloquea. La protección nativa de Supabase Auth
(*Authentication → Policies → Leaked password protection*, requiere plan Pro)
sigue sin activarse en el panel; al activarla, esta comprobación queda redundante
pero no estorba.
