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
npm run db:respaldo  # respaldo de SOLO LECTURA de los datos en respaldos/ (no se sube a Git)
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

El detalle de cada módulo vive en `docs/modulos/` (ver "Módulos" abajo).

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
- `src/lib/planeacion/`: parser del Excel "PEDIDO DE MANUFACTURA", números PM, jerarquía MO/FU, imágenes. Al
  subir un PM, un **error** (rojo) lo rechaza y un **aviso** (amarillo) carga igual. Reglas de volumen: toda lista
  que pueda pasar de 1000 filas usa `paginarTodo` y todo `.in()` con muchos ids va en lotes de 100 (`enLotes`).
  Detalle (columnas toleradas, carga masiva y sus mediciones, Cancelados, imagen del mueble):
  `docs/modulos/planeacion.md`.
- `src/lib/estimaciones/`: motor de precios, recibos de acabados, armado y
  electrificación, revisión.
- `src/lib/planos/`, `src/lib/pdf/`, `src/lib/produccion/`: planos, PDF tamaño
  carta y búsqueda de muebles.
- `src/lib/offline/`: cola de capturas sin conexión (`docs/modulos/sin-conexion.md`).
- `supabase/migrations/`: esquema versionado. Los números de versión deben
  coincidir con `supabase_migrations.schema_migrations` del proyecto.

## Roles y áreas

Roles: `desarrollador` (acceso global), `administrador` y `trabajador` (ligados a
un área), `usuario` (sin asignar), `maquilador` (externo, siempre de
Estimaciones, con contratista y una o más áreas de maquila: acabados, armado,
electrificación). Definidos en `src/lib/auth/roles.ts`. **Cada quien ve solo sus áreas**
(`src/lib/auth/acceso.ts`, `areasDePerfil`): el administrador y el trabajador, la suya; el maquilador,
Estimaciones; el desarrollador, todas más Administración; el `usuario` sin área, solo su perfil. Cada
layout de área muestra `SinAcceso` si no es suya, el menú solo pinta las propias y el buscador global
quita lo que no puede abrir. El perfil vive en `/cuenta` (el maquilador, `/estimaciones/cuenta`;
`/planeacion/cuenta` redirige desde `next.config.ts`). Las reglas reales viven
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
- **La base es una sola** (local, pruebas, vistas previas y producción): una migración aplicada ya está en
  producción. Aplicarla **justo antes de fusionar** su PR (CI en verde) y fusionar ese mismo día; si el PR se
  cierra sin fusionar, deshacerla. Antes de algo que borre o mueva datos, `npm run db:respaldo`. Detalle:
  `docs/operacion.md` ("Cambios de base de datos" y "Respaldo de la base").

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

## Módulos (el detalle vive en `docs/modulos/`)

Antes de tocar un módulo, leer su archivo: ahí está cómo funciona, qué migración hizo cada cosa y las trampas
conocidas. Al cambiarlo, actualizar ese archivo, no este.

- **Planeación** (`docs/modulos/planeacion.md`): carga del PM, errores contra avisos, carga masiva y sus
  mediciones, Cancelados, imagen del mueble.
- **Producción** (`docs/modulos/produccion.md`): ruta del mueble (pasos que se repiten; el tope es por paso; un
  proceso repetido se cobra cada vez), inicio y tablero (Por asignar, Por entregar, En Calidad), carrito → liberar →
  panel de asignación (sin despiece no se libera un mueble con componentes), despiece y entrega por partes. Toda
  lectura por muebles usa `leerEnTandas` con orden estable (desempate por `id`): la base corta cada respuesta en
  1000 filas sin avisar. Las "rutas por parte" son del modelo anterior a `ruta_por_mueble_completo` y solo aplican
  a muebles que ya trabajaban así.
- **Calidad** (`docs/modulos/calidad.md`): solo evalúa lo que Producción preaprobó (ajuste
  `verificacion_produccion`, encendido); revisión final del mueble completo (ajuste `revision_final`) con el origen
  de la falla; no conformidades e importación del Excel BD-CONTROL (el Excel manda; cada fila se reconoce por su
  clave y por su contenido).
- **Estimaciones** (`docs/modulos/estimaciones.md`): "PM contra cobrado", tope duro al guardar un recibo
  (`est_conciliar_renglon_pm`: no más que el PM ni que lo que Calidad aprobó; **al reescribirla, tomar la versión
  vigente de la base, no la de una migración vieja**), reprocesos y recibos por llegar. `cobro_segun_produccion`
  está apagado.
- **QR y trazabilidad** (`docs/modulos/qr.md`): ficha del mueble `/q/<ítem>`, etiquetas QR y pago al maquilador
  (se toca solo en `src/lib/trazabilidad/pago-maquilador.ts`).
- **Celular e instalación** (`docs/modulos/interfaz.md`): zona de toque de 44 px (un control dentro de otro no la
  recibe: si es chico, se agranda en su pantalla), `required` en campos obligatorios y `title` en un botón apagado
  con el porqué, fichas imprimibles con `@container` y no con `sm:`; instalación desde `/instalar`.
- **Notificaciones y avisos** (`docs/modulos/notificaciones.md`): Web Push (faltan las llaves VAPID en Vercel) y
  avisos por área que nacen de **triggers** de la base, nunca de la pantalla; un aviso que falla nunca frena el hecho.
- **Capturas sin conexión** (`docs/modulos/sin-conexion.md`): la entrega y el despiece de Producción van por la
  cola; otra captura solo si su ruta acepta `claveEnvio` y repetirla no duplica nada.

## Seguridad

Ver `SEGURIDAD.md`: capas de defensa, variables opcionales (`REGISTRO_DOMINIOS_PERMITIDOS`,
`NEXT_PUBLIC_SITE_URL`, `CSP_SOLO_REPORTE`) y pasos manuales en Supabase/Vercel. Reglas que no
hay que romper: la lectura de datos exige rol asignado (`is_staff()`; un `usuario` recién
registrado no ve nada), las imágenes se validan por su contenido real antes de `sharp`
(`src/lib/seguridad/imagen.ts`), el Excel de un PM se revisa antes de leerlo (`src/lib/seguridad/excel.ts`: es un ZIP de verdad, sin bombas, y
**máx. 50 MB de XML al abrirlo**: un PM de 249 MB sin comprimir —millones de filas vacías con formato— hacía que el lector pidiera más de 4 GB y
tumbara el servidor; el PM real más grande de 2024–2026 trae 13 MB), `?next=` solo acepta rutas internas
(`src/lib/seguridad/redireccion.ts`) y toda tabla nueva lleva RLS desde su migración.

## Contraseñas filtradas

Se comprueban en la app contra Pwned Passwords (k-anonimato: solo sale el prefijo
de 5 caracteres del hash SHA-1; ver `src/lib/auth/contrasena-filtrada.ts`) al
crear usuarios, restablecer contraseñas, registrarse y cambiar la propia. Si el
servicio no responde no bloquea. La protección nativa de Supabase Auth
(*Authentication → Policies → Leaked password protection*, requiere plan Pro)
sigue sin activarse en el panel; al activarla, esta comprobación queda redundante
pero no estorba.
