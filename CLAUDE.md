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

## Preaprobación de Producción

Calidad solo evalúa piezas que Producción preaprobó, y sus pantallas solo **muestran** esos muebles
(más lo que ya tiene informes): lo que sigue en taller no aparece (`visiblesParaCalidad` en
`src/lib/calidad/estado-item.ts`, lectura en `preaprobados-db.ts`). La preaprobación se hace al **registrar la
entrega**: quien toma la foto marca si las piezas cumplen (nace verificada y pasa a Calidad) o no
cumplen (nace rechazada, con motivo). Lo controla el ajuste `verificacion_produccion` de la tabla
`ajustes_flujo`, hoy ENCENDIDO (migración `entrega_con_preaprobacion`). Apagado, Calidad evalúa todo
ítem liberado aunque no haya entregas (un mueble sin entregas se evalúa completo) y las entregas nacen
verificadas. Cómo apagarlo o encenderlo y qué anotar después: `docs/operacion.md` ("Si Calidad no puede
evaluar un mueble"). La pantalla lee el ajuste con `src/lib/calidad/ajustes-flujo.ts`; si no puede
leerlo asume el flujo con verificación.

## Ruta de Producción

Cada mueble padre liberado tiene una **ruta**: pasos en orden que se pueden repetir (Armado → Barniz →
Armado). La sugerida es Armado → Superficie Sólida → Barniz → Electrificación (S.S. y Electrificación solo
si el mueble o sus componentes las llevan); se crea con la primera asignación o al guardar la ruta
(`guardar_ruta_produccion`, bloqueo optimista por versión). Migración `ruta_produccion`, lógica sin base en
`src/lib/produccion/ruta.ts` y `flujo-mueble.ts`.

- Cada asignación es de un paso (`asignaciones_produccion.paso_id`) y el tope es **por paso** (la cantidad
  del mueble), no por proceso. El retrabajo no cuenta y hereda el paso (`trg_paso_de_retrabajo`).
- Asignar más de lo que el paso anterior entregó y verificó **no se bloquea**: se avisa y la asignación
  queda `adelantada`.
- Un paso con asignaciones vigentes no se quita; los quitados quedan con `retirado_en`.
- Un paso no está terminado mientras Calidad tenga piezas rechazadas de sus lotes sin reasignar
  (`rechazado_por_reasignar` del resumen). Con un proceso repetido, el resumen y los lotes de Calidad dicen
  qué vez es (`vez_paso` de `veces_proceso`; en pantalla "Armado 2" con `etiquetaProceso`). La línea de
  tiempo de Planeación cuenta un proceso hasta terminar todas sus pasadas (migración
  `correcciones_ruta_produccion`).
- Un proceso que la ruta repite **se cobra cada vez**: en Estimaciones lo esperado de un mueble padre en
  Armado/Acabados es cantidad del PM × pasos de armado/barniz de su ruta (mínimo 1; `veces_proceso_ruta`,
  migración `recibos_procesos_repetidos`). Componentes y Electrificación siguen 1×. Lo usan el control al
  guardar el renglón, el campo Modelo de la captura y "PM contra cobrado" (`cantidad_pm_acabados/armado`).

## Revisión final de Calidad (apagada)

Además de los lotes por proceso, Calidad puede revisar el **mueble completo** antes de mandarlo a obra
(migración `revision_final_calidad`). Está detrás del ajuste `revision_final` de `ajustes_flujo`, creado
**apagado** hasta que Calidad confirme que así trabaja (cómo encenderlo: `docs/operacion.md`).

- Listas = todo lo que Calidad aprobó en el **último paso** de la ruta (incluidos los retrabajos de la
  propia revisión final que ya llegaron ahí) − lo revisado (`piezas_listas_revision_final`, vista
  `revision_final_muebles`).
- `registrar_revision_final`: folio `FIN-` por resultado; lo rechazado lleva motivo y el paso de la ruta al
  que regresa, y desde ahí **sigue el resto de la ruta**: Producción lo reasigna paso por paso con
  `crear_retrabajo_revision_final`, que toma el siguiente paso (`siguiente_paso_revision_final`; vista
  `rechazos_revision_final`, pantalla Rechazado por Calidad). Ese retrabajo no cuenta contra el tope del
  paso; el retrabajo de sus lotes hereda el vínculo (`trg_paso_de_retrabajo`). Un paso con piezas de la
  revisión final pendientes no se quita de la ruta.
- Solo muebles padre. No cambia el cobro ni la revisión por lotes: lo retrabajado por la revisión final no
  suma a "Calidad aprobó" de Estimaciones (ya se aprobó una vez). Liberado a obra = la final aprobó la
  cantidad del mueble.

## Cuadre con Calidad (Estimaciones)

"PM contra cobrado" (`/estimaciones/pm-cobrado/<OT>` y el reporte semanal) cruza, por O.T. y variante del
modelo (código + descripción), lo que declaró Planeación, lo que Calidad aprobó y lo cobrado en recibos
(migración `cuadre_calidad_recibos`). Sin campos nuevos para el maquilador:

- **Componentes (hijos)**: salen como filas aparte bajo su mueble y el campo "Modelo" del recibo de
  Acabados/Armado también los ofrece (`CampoModeloOt`). Un recibo puede cobrar un componente suelto y se
  compara contra la cantidad de ese componente: el trigger `est_conciliar_renglon_pm` no cambió, solo
  `cantidad_pm_variante` los incluye. Electrificación sigue solo con padres con iluminación. El saldo por
  código (`cantidad_pm_ot`, `saldosDeVariantes`) NO suma componentes.
- **"Calidad aprobó" por área** (`aprobado_calidad_variante`, interna): barniz → Acabados y armado → Armado, de
  lotes de equipos que no son de planta (la planta no cobra recibo); en un componente, su último informe (todo
  o nada). Solo hay dato si Producción asignó el mueble en el sistema; si no, es null y no se marca nada.
  Electrificación no se compara con Calidad.
- **Listo para cobrar** = aprobado por Calidad − cobrado (filtro de la O.T. y del reporte). Un recibo cobrado
  de más se **marca al revisarlo** (`recibo_contra_calidad`, `src/app/estimaciones/calidad-recibo.tsx`): es un
  aviso, no bloquea ni le pide motivo al maquilador; se calcula al abrir, así que desaparece si Calidad aprueba.
- No cubre el doble cobro (el mueble y también sus componentes por el mismo trabajo): salen juntos en pantalla.

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
- El **despiece** de Producción también va por la cola (`/api/produccion/despiece`): su `claveEnvio`
  queda en `despieces_produccion_historial` y `guardar_despiece_produccion` no guarda dos veces la misma
  clave. Guardar exige la versión que se tenía abierta (bloqueo optimista): si alguien guardó antes, la
  cola lo muestra como rechazado (409) y el trabajo sigue en la pantalla (hay borrador local).
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
