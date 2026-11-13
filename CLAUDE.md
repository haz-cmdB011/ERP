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

Calidad solo **evalúa** piezas que Producción preaprobó, pero **ve** todo lo enviado a producción (desde el
20 oct 2026; antes lo de taller no aparecía): arriba lo listo (preaprobado o con informes,
`listosParaCalidad` en `src/lib/calidad/estado-item.ts`, lectura en `preaprobados-db.ts`) y abajo, plegado,
"En taller" (`enTallerParaCalidad`, el mueble va junto con sus componentes). Lo de taller no se aprueba ni
cuenta como pendiente en el panel ni en la O.T.; tiene "Reportar falla", que abre el alta de no conformidades
prellenada (`?reportar=1&reportar_proyecto=…&reportar_mueble=…`). Producción **ya no califica** al registrar la
entrega ni sube foto (migración `entrega_sin_foto_ni_calificacion`): solo fecha, cantidad y folio, y la
entrega nace verificada y pasa a Calidad, que es quien evalúa. Las entregas viejas conservan su foto y su
"cumplen / no cumplen". Lo controla el ajuste `verificacion_produccion` de la tabla
`ajustes_flujo`, hoy ENCENDIDO (migración `entrega_con_preaprobacion`). Apagado, Calidad evalúa todo
ítem liberado aunque no haya entregas (un mueble sin entregas se evalúa completo) y las entregas nacen
verificadas. Cómo apagarlo o encenderlo y qué anotar después: `docs/operacion.md` ("Si Calidad no puede
evaluar un mueble"). La pantalla lee el ajuste con `src/lib/compartido/ajustes-flujo.ts`; si no puede
leerlo asume el flujo con verificación.

## Ruta de Producción

Cada mueble padre liberado tiene una **ruta**: pasos en orden que se pueden repetir (Armado → Barniz →
Armado). La sugerida es Armado → Superficie Sólida → Barniz → Electrificación (S.S. y Electrificación solo
si el mueble o sus componentes las llevan); se crea con la primera asignación o al guardar la ruta
(`guardar_ruta_produccion`, bloqueo optimista por versión, una versión por mueble). Migración `ruta_produccion`,
lógica sin base en `src/lib/produccion/ruta.ts` y `flujo-mueble.ts`.

**Ruta del mueble completo** (migración `ruta_por_mueble_completo`, 5 nov 2026; reemplaza lo de rutas por
parte de abajo para lo nuevo): el mueble **se asigna completo** aunque tenga despiece y su ruta es la única;
las partes ya no llevan ruta ni se asignan (una parte nueva nace con `ruta_guardada_en` y sin pasos). La
ruta se elige **en el carrito** ("Cambiar ruta" en cada mueble): por liberar se guarda en el aparato
(`useRutasCarrito`, `carrito-navegador.ts`) y `/api/produccion/items/liberar` la guarda al liberar
(`pasosConIds`); ya liberado se guarda directo. Sin elegir, la sugerida. El panel solo asigna pasos del
mueble y muestra el despiece como consulta con el **icono y color de cada material**
(`src/app/produccion/material-parte.tsx`, que también usa el editor del despiece). Los muebles que ya
trabajaban por partes (con asignaciones de partes vigentes) conservan su tabla: lo de sus partes solo se
consulta y entrega, sin "+" (`partesConRuta`). Lo que sigue describe ese modelo anterior.

**Rutas por parte** (migración `rutas_por_parte`, 26 oct 2026): la ruta del mueble es **solo del mueble
completo** y cada parte del despiece tiene **la suya** (`pasos_ruta_produccion.parte_id`: null = mueble). Son
independientes: agregar un paso al mueble no aparece en sus partes ni al revés (la Tabla: Armado → Barniz;
el herraje: Armado). Primero van las partes y después el mueble: lo listo para su primer paso es lo que
alcanza la parte más atrasada en el último paso de su ruta (`muebles_por_partes`; `partesCompletas`). Un
mueble con partes nace con su ruta **vacía**; lo que se le hace ya armado lo agrega Producción. **No hay
proceso Ensamble**: ensamblar es un Armado del mueble completo (la migración `ensamble_produccion`, del mismo
día, quedó reemplazada). Una parte que nunca guardó su ruta (`partes_despiece.ruta_guardada_en` null) usa la
sugerida y la base la crea al asignar o guardar (`asegurar_ruta_produccion`; `rutasDelFlujo` en pantalla).
Cada ruta se edita aparte con "Ruta" al abrir el mueble en el panel (`editar-ruta.tsx`, `p_parte_id`).
`procesos_omitidos` y `guardar_procesos_parte` ya no se usan. En los recibos, la idea acordada (aún no hecha)
es que el Armado con solo el modelo es el del mueble completo (el ensamble) y con componente, la parte.

- Cada asignación es de un paso (`asignaciones_produccion.paso_id`) y el tope es **por paso** (la cantidad
  del mueble), no por proceso. El retrabajo no cuenta y hereda el paso (`trg_paso_de_retrabajo`).
- Asignar más de lo que el paso anterior entregó y verificó **no se bloquea**: se avisa y la asignación
  queda `adelantada`.
- Un paso con asignaciones vigentes no se quita, y dos pasos con asignaciones no cambian de orden entre sí
  (`puedeMover`; la base también lo rechaza); los quitados quedan con `retirado_en`.
- Un paso no está terminado mientras Calidad tenga piezas rechazadas de sus lotes sin reasignar
  (`rechazado_por_reasignar` del resumen). Con un proceso repetido, el resumen y los lotes de Calidad dicen
  qué vez es (`vez_paso` de `veces_proceso`; en pantalla "Armado 2" con `etiquetaProceso`). La línea de
  tiempo de Planeación cuenta un proceso hasta terminar todas sus pasadas (migración
  `correcciones_ruta_produccion`).
- Un proceso que la ruta repite **se cobra cada vez**: en Estimaciones lo esperado de un mueble padre en
  Armado/Acabados es cantidad del PM × (pasos de armado/barniz de la ruta del mueble + los de la parte que más
  veces lo lleva) (mínimo 1; `veces_proceso_ruta`, migraciones `recibos_procesos_repetidos` y `rutas_por_parte`). Componentes y Electrificación siguen 1×. Lo usan el control al
  guardar el renglón, el campo Modelo de la captura y "PM contra cobrado" (`cantidad_pm_acabados/armado`).

## Inicio de Producción

`/produccion` es el panel de inicio del área (la lista de O.T./PM pasó a `/produccion/pedidos`):
**muebles recientes** (un recuadro por modelo, esté en uno o en varios PM, en un carrusel de tres en tres,
`carrusel-modelos.tsx`, con anillos concéntricos por estado,
sus O.T. de tres en tres y el nombre que abre el panel de asignación), lo que tiene cada equipo en taller y las O.T. con
pendientes (4 a la vista, "Ver más" despliega el resto); lo más reciente primero (las O.T., por su último movimiento, como los muebles; los muebles recientes, los 30 con el
último movimiento: subida del PM, liberación, asignación o entrega). Cuenta
muebles padre vigentes: los liberados con el estado del panel de asignación (`cargarMueblesDePanel`) y los por liberar.
Lógica en `src/lib/produccion/inicio.ts`, lectura en `inicio-db.ts`.

**Volumen (medido el 12 nov 2026, `npm run db:volumen`, solo lectura):** el inicio lee el flujo de TODOS los muebles
liberados cada vez que se abre o se actualiza, y eso crece en línea recta: con la clave de servicio, 1000 muebles
tardan ~4 s (171 peticiones) y 2000, ~7 s (341); con la sesión de una persona (RLS) algo más. Las lecturas por
tandas (`flujo-db.ts`, `rutas-db.ts`, `partes-db.ts`) piden de a pocas a la vez (`enParalelo`, `TANDAS_SIMULTANEAS`
en `tandas.ts`) para no saturar la base: antes iban todas juntas (242 a la vez con 2000 muebles). Hacia la pantalla
viajan ~1.5 KB por tarjeta del tablero (1000 muebles ≈ 0.5 MB; 3000 ≈ 1.6 MB) y el inicio se vuelve a leer cada
minuto por pestaña. Las tandas de 25 de componentes y asignaciones no se agrandan a ciegas: la base corta cada
respuesta en 1000 filas sin avisar. Si el inicio pasa de unos 2000 muebles liberados, lo siguiente es no leer el
flujo de lo terminado, o que la base calcule el estado de cada mueble (hoy se calcula en `flujo-mueble.ts`).

**Tablero** (única vista del inicio desde el 9 nov 2026: la lista se quitó "por el momento" y `?vista=lista` ya no hace nada; `lista-modelos.tsx`, `bitacora-taller.tsx` y `cambiar-vista.tsx` siguen en el repo sin usarse, por si se vuelve a poner): **una sección
por O.T.** (la de movimiento más reciente primero, "Sin O.T." al final; cuando hay más de tres solo la primera empieza abierta, todas se
pliegan; el título abre la pantalla de la O.T. y trae cuántas hay en cada columna), cada una con **columnas que salen del
estado, no se arrastran** (`renglonesDeTablero` en `control-taller.ts`, `columnaDeRenglon` en `tablero.ts`): **"Por entregar"**
(asignaciones que siguen en taller, con lo que falta entregar) y **"Por asignar"** (todo mueble liberado en estado por asignar, tenga o
no un proceso ya entregado, **y el asignado a medias**: el paso en que va aún tiene piezas sin equipo; es el mismo "Por asignar" de la
leyenda de colores). Su tarjeta dice cuánto falta: "13 PZA" si no se ha asignado nada o "Faltan 8 de 13 PZA · Armado" si ya se asignó una
parte (`faltaPorAsignar` de `inicio.ts`, el mismo tope por paso de `crear_asignacion_produccion`; `esPorAsignar` en `control-taller.ts`).
Un mueble que va por partes del despiece no entra por esta vía. Lo que sigue por liberar no sale: se
libera antes, desde el carrito. Una **tercera columna, "En Calidad"**, junta los muebles con piezas que ya
entregó Producción y esperan la revisión final de Calidad ("3 de 13 PZA en revisión"; vista
`revision_final_muebles`, columna `pendientes`, que lee `en-calidad-db.ts` y `conEnCalidad` de `inicio.ts` anota
en cada mueble). Solo informa, sin botón, y no sale si no hay nada (ni la tira ni su punto violeta en el encabezado
de la O.T.); un mueble puede salir a la vez en Por asignar y en Calidad con piezas distintas. Un enlace a
Calidad no se pone a propósito: quien es de Producción no abre esas pantallas. Si la lectura falla, la columna
no sale y el inicio sigue (aviso en la consola del servidor). Con la revisión final apagada (`ajustes_flujo`) no
sale nada: Calidad evaluaría entonces por entrega y no por mueble. Cada tarjeta lleva miniatura que se amplía con el visor de siempre (`ImagenAmpliable`), nombre que
abre el panel, **los mismos anillos concéntricos de la lista** (`AnillosConcentricos`: cuántos muebles de su modelo hay por
liberar, por asignar, en taller y terminados; `conteosPorModelo` sale de `modelosRecientes`, y la leyenda de colores de arriba
de la página) y el PM que abre su pedido. En "Por asignar" va el botón **Asignar**, que abre
`/produccion/panel?ids=<mueble>` (el panel con ese mueble ya abierto). En "Por entregar" va el botón **Entregar** (solo quien
edita Producción; sin palomita ni tache en la tarjeta) y, **al tocar cualquier parte del texto de la tarjeta** (nombre, equipo,
PM, "5 de 13 PZA" y su barra; ahí el nombre y el PM ya no son enlaces) se abre la **vista previa
flotante** (`vista-previa-mueble.tsx`, una ventana sobre la página con el fondo difuminado, Esc o tocar fuera la cierra): imagen del
mueble, nombre, anillos de su modelo, avance, la ruta como línea de puntos con el % de cada proceso (`procesosDeMueble` de `inicio.ts`,
el mismo avance de las columnas del panel), la **Bitácora** (solo la palomita y el tache de la asignación, `MarcaSeleccionable`;
sin tira de datos ni historial a la vista: el registro de cada cambio lo sigue escribiendo el trigger de la base) y, debajo, un
menú: panel de asignación y pedido (por eso la tarjeta ya no los enlaza).
**Entregar** abre una ventana mínima (`entregar-mueble.tsx`): % antes y después con barra, cantidad con − / +, "Entregar todo",
folio de la hoja y fecha (hoy, con "Cambiar fecha"). Registra por la misma ruta que "Registrar entrega" del panel
(`POST /api/produccion/entregas`, con cola sin conexión), así que al guardar la tarjeta y el panel se actualizan (`router.refresh`).
Si la entrega del mueble se hace **por partes** del despiece (`partesParaEntrega`; `entregaPorPartes` de `MuebleInicio` →
`porPartes` de la tarjeta), la ventana ofrece además el enlace al panel de asignación con ese mueble (`hrefPanel`) para entregar por partes.
**Lo urgente va primero**: cada tarjeta lleva un
chip de plazo según la fecha de entrega de su PM ("Atrasada 3 d", "Vence hoy", "Vence en 2 d"; `plazoDeTarjeta`, `plazosDePedidos`; sin
fecha de entrega no hay chip), las tarjetas se ordenan por urgencia y después por lo más reciente (`reciente`), las O.T. con algo
atrasado van primero y su encabezado dice cuántas ("2 atrasadas"). Por omisión el tablero muestra las 30 tarjetas que más importan
(`MAX_TARJETAS_RECIENTES`: lo urgente y luego lo reciente; el botón "Todos" muestra el resto). **El PM siempre se ve corto** (`pmCorto`,
`src/lib/compartido/pm-corto.ts`): solo "PM009-26" o, si hay SDC, solo "SDC-1"; el nombre completo queda en el `title`. 8 tarjetas
por columna y "Ver todas". No cubre un mueble por partes ni uno cuyo paso sigue en proceso con todo asignado y sin
asignación en taller (casos raros): esos se ven en el panel. **Se actualiza sola** (`actualizar-solo.tsx`): vuelve a leer cada minuto con la pestaña a la vista y al regresar a ella; no lo hace sin
conexión ni con una ventana abierta, y muestra "Actualizado hh:mm". Arriba, si hay **rechazos de Calidad por reasignar**
(`contarRechazosPorReasignar`: lotes y revisión final, el mismo criterio de Rechazos), sale un aviso que lleva a `/produccion/rechazos`.
Una asignación con tache en la Bitácora lleva en la tarjeta "✕ No está" (solo aviso). La leyenda de colores llama "Por entregar" a lo que antes decía "En taller". Lógica en `src/lib/produccion/tablero.ts`, pantalla en
`tablero-marcas.tsx`.

**Bitácora de taller** (nov 2026; esta lista del inicio está **quitada por ahora**, ver Tablero): se llamaba "Bitácora de producción" (`lista-modelos.tsx`, 8 a la vista y
"Ver más"): lo más reciente primero (sin encabezados por día), con la hora (`dias.ts`) y de qué fue el último
movimiento de cada modelo (PM subido, liberado, asignado, entrega; `tipoReciente`). Un renglón por modelo con sus anillos, sus O.T. y, al lado, quién lo tiene: equipo, cuántos
(pendiente de lo asignado), O.T./PM, **palomita o tache que elige quien asigna (Producción)** y "Asignar" (abre
`/produccion/panel` filtrado por ese PM; "Liberar" y el pedido si el mueble sigue por liberar). **Todos los
muebles llevan marca**: los asignados, una por asignación, y los que aún no tienen equipo ("Sin equipo · Por
asignar"), una por mueble. Se guarda en `marcas_taller_produccion` (migraciones `marcas_taller_produccion` y
`marcas_por_mueble`; una fila marca una asignación o un mueble, nunca las dos; sin fila = sin marcar; la ven
todos los internos, la eligen quienes son de Producción; `POST /api/produccion/marcas` con `asignacionId` o
`itemId`, `marca-seleccionable.tsx`) y es solo informativa: no cambia estados ni cobros.

**Control de la bitácora** (migración `historial_marcas_taller`): cada marca puede llevar una **nota** (el
motivo, hasta 300 caracteres; al poner el tache se abre la ventana, se puede omitir) y cada cambio queda en
`historial_marcas_taller_produccion`, que escribe solo un trigger (nadie lo edita desde la app, sin llaves
foráneas: sobrevive a que se borre el mueble o la asignación, y guarda copia del modelo, PM, O.T., equipo y
nombre de quien lo hizo). La ventana de cada marca (`marca-seleccionable.tsx`) muestra sus últimos cambios
(`GET /api/produccion/marcas/historial`). La pantalla **Bitácora de taller** (`/produccion/bitacora`, con lista de
control, historial, Excel e imprimir) se **quitó el 9 nov 2026** junto con su ruta de exportar y su lectura
(`control-taller-db.ts`, `bitacora-excel.ts`): se recupera del historial de Git. Lógica que sigue en el repo en
`control-taller.ts` y `historial-marcas.ts`.
**Los motivos están apagados por ahora** (`MOTIVOS_ACTIVOS = false` en `historial-marcas.ts`): no se piden ni se
muestran en pantalla ni en el Excel; la columna, el trigger y la ruta siguen listas, y para volver a verlos
basta ponerlo en `true`. Lo entregado en los últimos 14 días también sale (`DIAS_BITACORA`). Las asignaciones
de modelos que no están entre los 30 recientes salen abajo, por equipo (`bitacora-taller.tsx`); "O.T. con
pendientes" va al final. Lógica en `src/lib/produccion/bitacora.ts`, lectura en `bitacora-db.ts`.

## Carrito y panel de asignación

Llevar muebles a los equipos de maquila sigue un solo camino; el pedido y la O.T. ya no traen botones de
"Asignar a equipos" ni de liberar:

- **Carrito**: en el pedido se marcan muebles o componentes (o se usa el botón de carrito de cada fila) y se
  mandan al carrito. Vive en el aparato (`localStorage`, `src/lib/produccion/carrito-navegador.ts`; lógica pura
  con pruebas en `carrito.ts`) y junta ítems de cualquier PM u O.T. `/produccion/carrito` los agrupa por
  O.T. → PM con su estado real (`/api/produccion/carrito`, `carrito-db.ts`).
- El pedido de Producción **solo muestra muebles padre**; sus componentes viajan con el mueble al carrito
  (se liberan con él) y ahí tampoco salen como filas (`filasCarrito`).
- **Despiece en el carrito**: un mueble con componentes muestra si le falta o ya tiene su despiece y lo abre
  al tocar su fila, que despliega sus componentes como el mismo editor (`despiece-en-linea.tsx`, datos de `GET /api/produccion/despiece`,
  carga en `src/lib/produccion/despiece-db.ts`, que comparte la página del despiece). Al guardar se pliega.
  **Sin despiece no se libera** un mueble con componentes (botones del carrito y `/api/produccion/items/liberar`,
  que también usa Planeación). En el panel ya no se hace: solo "Editar despiece" si hace falta (o "Falta
  despiece" para los viejos). Cada parte del despiece se pinta del color de su material (`tipoMaterial`).
- **Despiece por modelo** (`copiarDespieceAlModelo`, al guardar en `POST /api/produccion/despiece`): se copia a
  los demás muebles vigentes del mismo modelo, de cualquier O.T./PM, **con los mismos componentes**
  (`firmaComponentes`: descripción + cantidad por mueble) que no tienen despiece o siguen con la copia anterior
  sin cambios. Uno editado a mano o con otros componentes no se toca. Cada copia pasa por
  `guardar_despiece_produccion`; el aviso al guardar dice a cuántos llegó.
- **Liberar** se hace desde el carrito (por PM o todo). Lo liberado sale del carrito y se abre el panel de
  asignación con esos muebles (`/produccion/panel?ids=…`, máximo `MAX_IDS_PANEL`). Lo asignado desde el
  carrito (muebles que ya estaban liberados) también sale.
- **Panel de asignación** (menú de Producción, `/produccion/panel`; simplificado el 5 nov 2026): todos los
  muebles liberados en **una lista plana** con una cabecera delgada por PM (PM, O.T., proyecto), sin niveles
  que abrir. Cada mueble va en una línea (`FilaMueble` de `pedidos/[id]/asignaciones/flujo-muebles.tsx`, que
  comparte la pantalla de asignaciones del PM): miniatura y nombre, la ruta en anillos y a la derecha **un solo
  botón** con lo que sigue ("Asignar Barniz", "Hacer despiece") o en qué va. Al abrirlo: primero las
  asignaciones por paso (las que siguen en taller, abiertas con su "Registrar entrega"), y al pie el despiece
  resumido por material (se despliega), "Cambiar ruta" y "Editar despiece". Filtros: selector de
  Activos / Por asignar / En proceso / Terminados (`estado`, por omisión Activos, también al llegar de liberar)
  y un buscador que filtra al escribir (`q`: PM, O.T., modelo, descripción, proyecto, cliente;
  `buscador-panel.tsx`); `ot` se sigue aceptando en la dirección. Lógica pura en
  `src/lib/produccion/panel.ts`, lectura en `panel-db.ts` (primero una fila liviana por mueble, `listarLiberadosDePanel`, para filtrar por O.T. y búsqueda; el flujo solo se carga de lo que queda). Se pintan 40 muebles y "Ver más" suma otros 40 (`?n=`); lo recién liberado abre por `?ids=` o, si son más de 100, por `?lote=<liberado_en>`, que devuelve `/api/produccion/items/liberar`. `flujo-db.ts` (`cargarFlujoMuebles`) arma el flujo
  y lo comparten el panel y el carrito.
- La pantalla de asignaciones de un PM (`/produccion/pedidos/<id>/asignaciones`) sigue existiendo (la usan el
  QR y el tablero), pero ya no se llega a ella desde el pedido ni la O.T.

## Despiece por partes (fases 1 y 2)

Un mueble se puede asignar **por partes de su despiece** (migración `despiece_por_partes`): cada línea del
despiece es una parte con id fijo (`partes_despiece`; la línea lleva `id` en `despieces_produccion.lineas`)
y una asignación es de una parte (`asignaciones_produccion.parte_id`) o del mueble completo (null).

- Una asignación de una parte va en **piezas de esa parte** (migración `partes_en_piezas_y_ruta_por_parte`):
  la Tabla, 3 por mueble × 13 muebles = 39 piezas; se pueden asignar 20. Sus entregas y lotes también van en
  piezas y la asignación lleva la unidad de la parte. Tope por paso de una parte = piezas por mueble ×
  cantidad del mueble. Lo del mueble completo (muebles sin componentes o asignaciones viejas) sigue en
  muebles y cuenta para todas sus partes × sus piezas por mueble.
- **Cada parte tiene su ruta** (ver "Rutas por parte" arriba): una asignación de una parte va en un paso de su
  ruta y la del mueble completo, en uno de la del mueble (la base rechaza cruzarlas). El paso anterior de una
  parte (para "listo"/adelantada) es el anterior de su ruta; el primero del mueble, lo que alcanzan sus partes.
- **Revisión final**: sin pasos del mueble, cuenta lo que alcanza la parte más atrasada en su último paso;
  con pasos, lo del último paso del mueble (`piezas_listas_revision_final`). Lo rechazado puede regresar a un
  paso de una parte: sigue el resto de su ruta en sus piezas (muebles × piezas por mueble) y después la del
  mueble (`siguiente_paso_revision_final`, columnas `siguiente_parte*` de `rechazos_revision_final`).
- **Cobro** (`verificado_produccion_variante`, `aprobado_calidad_variante`): un paso del mueble cuenta lo suyo;
  los de las partes se juntan por proceso y vez (`vez_paso_ruta`) y cuentan la parte más atrasada entre las
  que llevan ese proceso esa vez (`cobertura_partes_vez`). Si un mueble se reparte entre planta y maquilador,
  lo liberado para cobrar queda en 0 hasta la fase 3 (cobro por partes).
- Asignar: al abrir el mueble en el panel sale la **tabla del despiece**: una fila por parte y una del
  "Mueble completo", una columna por proceso (`columnasMueble`; "—" si esa ruta no lo lleva), con lo
  entregado de cada paso, su "+" y el botón "Ruta" de cada fila. En la fila del mueble, con despiece, hay
  **un anillo por proceso** (`avanceColumna`: las partes que lo llevan, ponderadas por su %, y el mueble
  completo si también lo lleva). El mueble completo de un mueble con partes **no lleva Barniz** hasta
  demostrar lo contrario (solo pantalla: `editar-ruta.tsx` no lo ofrece; uno que ya lo tenga lo conserva). `AsignarForm` pregunta
  "¿Qué se asigna?" (una parte o el mueble completo) y luego el paso de esa ruta; una parte va en piezas
  (`crear_asignacion_produccion` con `p_parte_id`; `crear_asignaciones_por_partes` ya no se usa). La parte sale en `etiquetaProceso`
  ("Armado · Base de metal") y `textoAvanceAsignacion` da "5/39 PZA" con la unidad de la parte.
- **Bloqueo** (`guardar_despiece_produccion`): una parte con asignaciones vigentes no se quita ni baja su
  cantidad por mueble; agregar partes o subir cantidades sí. Al volver a la sugerencia, la parte se
  reconoce por su componente del PM. El retrabajo hereda la parte (`trg_paso_de_retrabajo`).
- **El despiece se usa para asignar** (migración `despiece_porcentaje_obligatorio`): un mueble con
  componentes vigentes en el PM no se asigna sin despiece guardado (`requiere_despiece`; en el panel sale
  "Hacer despiece" en lugar del "+"); los muebles sin componentes se asignan completos. Con despiece, el
  mueble completo se asigna solo en los pasos de su propia ruta. Cada parte vale un
  **% del mueble** en partes iguales (`partes_despiece.porcentaje`): no se captura, el editor lo calcula
  solo al guardar (`repartirPorcentajes`); la base acepta un % por línea que sume 100. Solo es visual (los
  anillos por proceso): el cobro y la revisión final siguen contando un mueble cuando todas sus partes.
- **Encuadre** (`encuadreMueble` en `flujo-mueble.ts`, solo pantalla): muebles completos = lo que alcanza la
  parte más atrasada, con lo entregado en el último paso de la ruta de cada parte (piezas ÷ piezas por mueble,
  hacia abajo). También da, por parte, sus piezas terminadas, los muebles que alcanza y lo que le falta
  para llegar a la más adelantada (20 tablas de 3 = 6 muebles → al herraje le faltan 6). En pantalla solo
  sale "0/23 completos" junto a la cantidad del mueble en el panel; el resto queda como lógica.
- **Dividir y entregar por partes** (migración `entrega_por_partes`, 5 nov 2026): en el editor, "Dividir en partes"
  separa una línea ("Puerta con marco" → Puerta y Marco; `sugerirPartes`/`dividirLinea` en `despiece.ts`; las
  nuevas no se ligan al componente del PM y no se divide una ya asignada). El mueble sigue asignándose completo con
  una sola ruta, pero **la entrega** de un mueble con despiece puede ser "Por partes" (`registrar-entrega.tsx`,
  `partes` en `POST /api/produccion/entregas`): `registrar_entrega_partes` guarda las piezas por parte
  (`entregas_partes_produccion`) y, cuando la parte más atrasada alcanza para más muebles que los ya entregados,
  registra sola la entrega del mueble completo (`registrar_entrega_produccion`) por la diferencia; Calidad y cobro
  siguen contando muebles. No aplica a asignaciones de una parte ni a muebles de antes con ruta por parte
  (`partesParaEntrega`, `src/lib/produccion/entregas-partes.ts`). Anular esa entrega del mueble no devuelve las piezas.
  **Procesos por parte** (migración `procesos_por_parte`, aplicada el 5 nov 2026): cada línea del
  despiece dice por qué procesos NO pasa (`partes_despiece.procesos_omitidos`, `procesos_omitidos` en la línea; vacío =
  todos, lo normal; "Pasa por" en el editor, nunca los cuatro omitidos). La entrega por partes de una asignación (que es
  de un proceso) solo ofrece las partes que llevan ese proceso y los muebles completos se cuentan con ellas: el Barniz
  de la puerta no espera al marco si el marco no lleva Barniz.
  **Asignar por partes** (migración `asignar_por_partes`, aplicada el 5 nov 2026; interruptor por mueble,
  `rutas_produccion.por_partes`): por omisión el mueble se asigna completo con una sola ruta. En un mueble con
  despiece, "Asignar por partes" (pie del detalle, `asignar-por-partes.tsx`, `activar_asignacion_por_partes`) retira la
  ruta del mueble (sin asignaciones completas vigentes) y da a cada parte la suya: los procesos de la ruta del mueble
  menos los que omite ("Pasa por"). Entonces cada parte se asigna y entrega en sus piezas (`crear_asignacion_produccion`
  con `p_parte_id`, el "+" de la tabla y "Asignar partes"), y el mueble cuenta completo cuando la parte más atrasada
  termina su último paso (lo de "Despiece por partes" de arriba). "Volver al mueble completo" solo si ninguna parte tiene
  asignaciones vigentes. Sin la migración aplicada la lectura sigue (`leerRutas` tolera que falte la columna) y todo va
  por mueble completo. Con el interruptor encendido no aplica la entrega parcial por partes de arriba: sus partes tienen
  asignaciones propias.
- **Calidad revisa las partes y se cobran** (migraciones `calidad_revisa_partes` y `cobro_por_partes`, 6 nov
  2026): cada renglón de piezas de una entrega por partes es una entrega que Calidad aprueba o no (vista
  `lotes_partes_calidad`, `evaluar_entrega_parte_calidad`; en pantalla, `conLotesDePartes` de
  `src/lib/calidad/lotes-partes-db.ts` las junta con los lotes). La entrega del mueble que la base junta con
  esas piezas (`entregas_produccion.desde_partes`) no se evalúa directo: la aprueba
  `aprobar_mueble_desde_partes` cuando la parte más atrasada alcanza en piezas aprobadas. Lo no aprobado de
  una parte se vuelve a entregar en la misma asignación. Cobro: `aprobado_calidad_variante` da una fila por
  parte del despiece propio (lo aprobado de sus piezas o el mueble × piezas por mueble) y el tope de Calidad ya
  no exime a las partes. En "Rechazos de Calidad" sale "Partes por volver a entregar" (`partes-rechazadas.ts`).
- **Procesos en anillos** (pedido de Calidad, solo pantalla): un mueble con entregas se ve como su ruta en
  anillos, igual que en el panel de Producción (Armado → Barniz → …): cada anillo se llena con lo aprobado contra la
  cantidad del mueble (verde), lo por revisar (ámbar, con su número) y lo que está en retrabajo (rosa); al tocarlo
  salen sus folios (el historial). Debajo, un "Revisar Armado: 1 PZA del …" por entrega pendiente; el asistente dice
  "Revisar Armado" y muestra la ruta con ese proceso marcado. Ya no se suman piezas de procesos distintos. Lógica en
  `src/lib/calidad/pista-procesos.ts`, pantalla en `src/app/calidad/pista-procesos.tsx`.

## Revisión final de Calidad

Calidad revisa el **mueble completo** antes de mandarlo a obra, no cada proceso (migraciones
`revision_final_calidad` y `revision_final_obligatoria`). Revisar un lote por proceso queda como opción,
para cuando hay una falla ahí: en pantalla no se habla de "lotes" sino de **entregas identificadas por su
fecha** ("Revisar 3 pz del 20/10", página Entregas de `/calidad/entregas`), y el panel ya no tiene tarjeta ni
alerta de días sin evaluar (los datos siguen en la vista `lotes_calidad`). Está detrás del ajuste `revision_final` de `ajustes_flujo`, que se enciende
**después de fusionar** la pantalla que pide el origen de la falla (cómo: `docs/operacion.md`); encendida es
la puerta obligatoria hacia obra.

- Listas = lo que **Producción verificó** en el **último paso** de la ruta (entregas preaprobadas, incluidos
  los retrabajos que ya llegaron ahí) − lo que Calidad rechazó en esos lotes si los revisó − lo revisado
  (`piezas_listas_revision_final`, vista `revision_final_muebles`). Antes era lo que Calidad aprobó.
- `registrar_revision_final`: folio `FIN-` por resultado; lo rechazado lleva motivo, **dónde nació la falla**
  (`origen_paso_id`, un paso de la ruta, u `origen_area`: ingenieria, planeacion, compras, diseno, otra;
  exactamente uno; `AREAS_ORIGEN` en `src/lib/calidad/revision-final.ts`) y el paso de la ruta al
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
  `cantidad_pm_variante` los incluye. **Si Producción guardó un despiece que no es el sugerido**
  (`igual_a_sugerencia` = false), los componentes de ese mueble son sus partes (piezas por mueble ×
  cantidad del mueble en el PM) en vez de los hijos del PM; una parte ligada a un hijo conserva la
  descripción del hijo (`componentes_recibo_ot`, migración `recibos_segun_despiece`). El reporte usa la misma
  regla: en pantalla es **"PM de Producción contra cobrado"** (migración `pm_cobrado_segun_despiece`; la ruta
  y la función siguen siendo `pm-cobrado` y `ot_contra_cobrado`). Electrificación sigue solo con padres, pero cuenta los que llevan iluminación o electrificación en él o en sus componentes (`admite_electrificacion`, migración `electrificacion_estimaciones_por_componentes`). El saldo por
  código (`cantidad_pm_ot`, `saldosDeVariantes`) NO suma componentes.
- **"Calidad aprobó" por área** (`aprobado_calidad_variante`, interna): barniz → Acabados y armado → Armado, de
  lotes de equipos que no son de planta (la planta no cobra recibo); en un componente, su último informe (todo
  o nada). Solo hay dato si Producción asignó el mueble en el sistema; si no, es null y no se marca nada.
  Electrificación no se compara con Calidad.
- **Tope duro al guardar un recibo** (migraciones `cobro_limitado_por_pm_y_calidad` y `mensajes_cobro_cortos`, 3 nov
  2026; `reprocesos_segun_produccion` las sobrescribió el 4 nov y `tope_cobro_sobre_reprocesos` las volvió a poner):
  el trigger `est_conciliar_renglon_pm` no deja guardar un renglón **normal** que cobre más que el PM de la OT (ni con
  motivo; un modelo que no está en la OT tampoco) ni, en Acabados y Armado, más que lo que **Calidad aprobó** del
  mueble en el área (`aprobado_calidad_variante`, revisión final incluida; un mueble que no pasó por Producción y
  Calidad en el sistema no se cobra). Electrificación también se topa con lo que Calidad aprobó de ese proceso
  (`aprobado_calidad_electrificacion`, migración `cobro_por_partes`); S.S. no tiene recibo. La pantalla
  (`dialogo-descuadres.tsx`) avisa el PM antes de guardar; lo de Calidad lo dice la base al guardar. El **reproceso**
  conserva su regla (se mide contra el retrabajo reasignado y, si se pasa, pide motivo y deja discrepancia). **Cuidado
  al reescribir esa función: tomar la versión vigente de la base, no la de una migración vieja.**
- **(Apagado desde el 3 nov 2026) Se cobra según Producción** (migración `cobro_segun_produccion`, ajuste `cobro_segun_produccion` de
  `ajustes_flujo`, hoy APAGADO: manda Calidad): Calidad revisa el mueble completo, no cada proceso, así que lo liberado para
  cobrar es lo que **Producción verificó** al registrar la entrega (`verificado_produccion_variante`, interna,
  mismas reglas que la de Calidad y sin retrabajos; un componente, en la proporción de su mueble). "Calidad
  aprobó" queda solo informativo. Apagado el ajuste, todo vuelve a medirse contra Calidad. La app lo lee con
  `cobroSegunProduccion` (`src/lib/compartido/ajustes-flujo.ts`); si no puede, asume Calidad.
- **Listo para cobrar** = liberado − cobrado (filtro de la O.T. y del reporte; `liberadoArea` en
  `src/lib/estimaciones/pm-cobrado.ts`). Un recibo cobrado de más se **marca al revisarlo**
  (`recibo_contra_calidad`, que trae lo aprobado y lo verificado; `src/app/estimaciones/calidad-recibo.tsx`): es
  un aviso, no bloquea ni le pide motivo al maquilador; se calcula al abrir, así que desaparece al liberarse.
- No cubre el doble cobro (el mueble y también sus componentes por el mismo trabajo): salen juntos en pantalla.
- **Reprocesos** (migración `reprocesos_segun_produccion`): no gastan saldo del PM; se comparan contra el
  retrabajo que **Producción reasignó** tras un rechazo de Calidad (asignaciones con `informe_rechazo_id` o
  `revision_final_rechazo_id`, equipos que no son de planta, proceso del área; `retrabajo_recibo_ot`), en las
  mismas unidades (mueble o piezas de la parte). Pasarse, o cobrar reproceso sin retrabajo, pide motivo y deja
  una discrepancia `es_reproceso`. La causa es obligatoria (`renglones_causa_reproceso_check`) y la revisión
  la muestra junto al renglón.
- **Recibos por llegar** (panel de Estimaciones y `/estimaciones/por-llegar`, solo quien revisa recibos): lo que
  **Calidad aprobó** y aún no se cobra, por área (Acabados, Armado), con base Calidad siempre (el maquilador solo
  cobra lo aprobado), aunque `cobro_segun_produccion` esté encendido. "Calidad aprobó" incluye la revisión final
  del mueble (sin pasar de lo que Producción verificó de equipos externos; migración `recibos_por_llegar`). Cuenta
  muebles, al menos un recibo por O.T. y área (los equipos no están ligados al contratista) y un importe con el
  último precio pagado del modelo. Cada área muestra una tarjeta por mueble **entregado a Calidad** aunque no
  esté aprobado (`muebles_en_calidad`, migración `muebles_en_calidad`): aprobados, en revisión, sin entregar y,
  por parte del despiece, piezas entregadas y aprobadas. Lógica en `src/lib/estimaciones/por-llegar.ts`,
  lectura en `-db.ts`.

## QR del mueble

El QR de la Hoja de Viajero lleva solo el id del mueble (`/q/<ítem>`). Al escanearlo con la cámara abre la
**ficha del mueble** (`src/app/q/[itemId]/page.tsx`), pensada para entenderse de un vistazo:

- **Tarjeta de estado** (`ruta-qr.tsx`, lógica en `src/lib/trazabilidad/resumen-ruta.ts`): una frase ("En
  Armado · 5 de 7 entregadas") y una barra con un tramo por paso (ruta, revisión final, pago); al tocarla
  se abre la ruta completa.
- **Una acción principal por pestaña** (lo que sigue) con una línea de por qué, y las demás como
  "Más opciones" (`panelQr` en `src/lib/trazabilidad/areas-qr.ts`). Producción: registrar entrega si hay
  algo en taller, si no **asignar** ahí mismo (mismo `AsignarForm` del PM); opciones: ruta del PM, hoja,
  despiece; arriba, en rojo, lo que Calidad rechazó con su "Reasignar" (`rechazos-qr.tsx`). Calidad:
  **revisión final del mueble completo** ahí mismo (el mismo `Revisar` del pedido); opciones: componentes
  e informes, reportar falla y, plegadas, las entregas por proceso (`entregas-calidad-qr.tsx`; abiertas
  si la revisión final está apagada). Planeación: el PM. Estimaciones: sus recibos (`pago-qr.tsx`) y PM
  contra cobrado.
- **Historial**: los últimos 3 movimientos con quién hizo qué; el resto en "Ver todo".
Cada quien ve la pestaña de su área; el desarrollador, todas (`?area=`). El QR de un componente lleva a
su mueble. Arriba sale el botón del plano (datos del cuadro; el PDF sigue en el servidor de Ingeniería).
No hay tabla de eventos: el historial junta lo que ya guarda cada área (lógica pura en
`src/lib/trazabilidad/linea-tiempo-mueble.ts`, lectura en `linea-tiempo-db.ts`). Los escáneres dentro
de Producción y Calidad siguen yendo directo a su pantalla; las hojas viejas (dirección larga) abren la hoja.

- **Etiquetas QR** para pegar en el mueble: `/produccion/pedidos/<id>/etiquetas` (botón "Etiquetas QR" en
  la tabla del pedido; con selección, esos ítems; sin ella, todos los muebles liberados), 3 × 8 por hoja
  carta, una por mueble o una por pieza (`?por=pieza`, tope `MAX_ETIQUETAS`).
- **Salida a obra**: se probó y se quitó (no se usa); la migración `quitar_salidas_obra` borra lo que dejó
  `salidas_obra` en la base. El flujo del mueble termina en el pago al maquilador.
- **Pago al maquilador** (último paso de la ruta, pestaña Estimaciones e historial): los recibos vigentes
  que cobraron el mueble y si están pagados. Solo consulta, sin migración: liga por O.T. + código +
  descripción (Electrificación, por `planeacion_item_id`), la regla de "PM contra cobrado". Todo vive en
  `src/lib/trazabilidad/pago-maquilador.ts` (+ `-db.ts`, `pago-qr.tsx`): el pago del maquilador va a
  cambiar y debe tocarse solo ahí.

## Vista de celular

En pantallas táctiles (`pointer: coarse`) `src/app/globals.css` da a todo botón, enlace, `summary`, pestaña y
casilla con su texto una zona de toque de al menos 44 × 44 px con un `::after` invisible (no mueve el diseño), y
los campos y `select` miden 44 px de alto. No la reciben los controles dentro de algo que se desliza de lado
(`overflow-x-auto`: tablas, tiras del tablero), porque volvía desplazable el contenedor unos píxeles y atrapaba el
dedo; ahí se agrandan en su pantalla (`pointer-coarse:min-h-11`, `min-h-11 sm:min-h-9`). Tampoco los que ya
dibujan su `::after` (`after:` de Tailwind) ni **los que llevan otro control dentro** (`:has(...)`): el `::after`
se pinta encima del contenido y en una fila que se despliega con botones adentro (renglón del recibo, `summary`
con acciones) tapaba esos botones y el toque abría la fila. Por eso, **un control dentro de otro no recibe la
zona extra**: si es chico, se agranda en su pantalla. Dos controles chicos pegados (✓ y ✗ de la bitácora,
filas de barras) se roban toques en la orilla: se les da 44 px reales con `pointer-coarse:` en vez de confiar en
el `::after`.

También en táctil: `touch-action: manipulation` (dos toques rápidos no hacen zoom ni se pierden), los botones no
seleccionan su texto al dejar el dedo, y todo control se aclara mientras se presiona (`:active`, opacidad 0.6; un
`active:` o una opacidad propia de la pantalla gana). Los avisos salen **arriba** en celular (abajo tapaban la
barra de "Guardar"). **Tocar un botón deshabilitado ya responde** (`src/components/toque-deshabilitado.tsx`, en el
layout raíz; lógica en `src/lib/ui/toque-deshabilitado.ts`): si es el de enviar y falta un campo obligatorio, el
navegador lo marca y lo enfoca y sale "Falta llenar: …"; si no, sale como aviso su `title` (o `aria-description`
/ `data-motivo`). Por eso, en un formulario, marcar `required` los campos obligatorios y poner en el `title` de un
botón apagado el porqué. El visor de imágenes acepta pellizco y doble toque. Fichas que también se imprimen o se
pasan a PDF (viajero) se acomodan con consultas de contenedor (`@container`, `@xl:`), no con `sm:`: el PDF las
maqueta a 640 px aunque se descargue desde el celular.

Para que nada se corte a 375 px: filtros segmentados a todo lo ancho (2 × 2 o con texto que parte renglón),
`line-clamp-2` en vez de `truncate` cuando hay espacio abajo, y tablas anchas como tarjetas en celular (ejemplo:
Calidad › O.T.). Para revisar una pantalla: a 375 px, en cada control visible `document.elementFromPoint` en su
centro y orillas debe devolver el control o algo dentro de él.

## Capturas sin conexión

En el taller a veces se cae el Wi-Fi. La **entrega de Producción** se guarda en el
propio aparato (IndexedDB) si no hay red y se manda sola al volver, con un indicador en pantalla
(`EstadoEnvios`, en el layout raíz). Núcleo en `src/lib/offline/cola-envios.ts` (sin navegador, con
pruebas), almacén en `almacen-indexeddb.ts`, pegamento del navegador en `cola-navegador.ts`.

- **Repetir un envío nunca duplica**: cada captura lleva una `claveEnvio` que queda en la
  entrega (`entregas_produccion.clave_envio`, índice único `idx_entregas_produccion_clave_envio_unica`):
  `registrar_entrega_produccion` devuelve la misma entrega en vez de registrar otra (`src/app/api/produccion/entregas/route.ts`).
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
