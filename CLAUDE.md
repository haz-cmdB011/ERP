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
evaluar un mueble"). La pantalla lee el ajuste con `src/lib/calidad/ajustes-flujo.ts`; si no puede
leerlo asume el flujo con verificación.

## Ruta de Producción

Cada mueble padre liberado tiene una **ruta**: pasos en orden que se pueden repetir (Armado → Barniz →
Armado). La sugerida es Armado → Superficie Sólida → Barniz → Electrificación (S.S. y Electrificación solo
si el mueble o sus componentes las llevan); se crea con la primera asignación o al guardar la ruta
(`guardar_ruta_produccion`, bloqueo optimista por versión, una versión por mueble). Migración `ruta_produccion`,
lógica sin base en `src/lib/produccion/ruta.ts` y `flujo-mueble.ts`.

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

## Carrito y panel de asignación

Llevar muebles a los equipos de maquila sigue un solo camino; el pedido y la O.T. ya no traen botones de
"Asignar a equipos" ni de liberar:

- **Carrito**: en el pedido se marcan muebles o componentes (o se usa el botón de carrito de cada fila) y se
  mandan al carrito. Vive en el aparato (`localStorage`, `src/lib/produccion/carrito-navegador.ts`; lógica pura
  con pruebas en `carrito.ts`) y junta ítems de cualquier PM u O.T. `/produccion/carrito` los agrupa por
  O.T. → PM con su estado real (`/api/produccion/carrito`, `carrito-db.ts`).
- **Liberar** se hace desde el carrito (por PM o todo). Lo liberado sale del carrito y se abre el panel de
  asignación con esos muebles (`/produccion/panel?ids=…`, máximo `MAX_IDS_PANEL`). Lo asignado desde el
  carrito (muebles que ya estaban liberados) también sale.
- **Panel de asignación** (menú de Producción, `/produccion/panel`): todos los muebles liberados, por O.T. → PM,
  en el formato visual del flujo del PM (`FilaMueble` de
  `pedidos/[id]/asignaciones/flujo-muebles.tsx`; sin las tarjetas de avance por proceso): un "+" en un paso lo asigna, y al abrir un mueble se ven sus
  asignaciones y entregas. Cada O.T. y cada PM se despliegan como un mueble con sus componentes: cerrada,
  una O.T. muestra solo su resumen; abierta, sus PM; y abierto un PM, sus muebles (todo cerrado por omisión;
  abierto al llegar de liberar o con `ot`/`q`). Cada mueble lleva su miniatura (la primera imagen del ítem,
  que se amplía al tocarla; sin imagen, un cuadro vacío para que las filas no se desalineen). Filtros por la dirección: `estado` (por omisión "Activos" =
  por asignar + en proceso; los terminados solo si se piden, para no cargar el historial), `ot` y `q`. Lógica pura en
  `src/lib/produccion/panel.ts`, lectura en `panel-db.ts`; `flujo-db.ts` (`cargarFlujoMuebles`) arma el flujo
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
- Pendiente: fase 3, cobro por partes.

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
  `cantidad_pm_variante` los incluye. Electrificación sigue solo con padres, pero cuenta los que llevan iluminación o electrificación en él o en sus componentes (`admite_electrificacion`, migración `electrificacion_estimaciones_por_componentes`). El saldo por
  código (`cantidad_pm_ot`, `saldosDeVariantes`) NO suma componentes.
- **"Calidad aprobó" por área** (`aprobado_calidad_variante`, interna): barniz → Acabados y armado → Armado, de
  lotes de equipos que no son de planta (la planta no cobra recibo); en un componente, su último informe (todo
  o nada). Solo hay dato si Producción asignó el mueble en el sistema; si no, es null y no se marca nada.
  Electrificación no se compara con Calidad.
- **Se cobra según Producción** (migración `cobro_segun_produccion`, ajuste `cobro_segun_produccion` de
  `ajustes_flujo`, ENCENDIDO): Calidad revisa el mueble completo, no cada proceso, así que lo liberado para
  cobrar es lo que **Producción verificó** al registrar la entrega (`verificado_produccion_variante`, interna,
  mismas reglas que la de Calidad y sin retrabajos; un componente, en la proporción de su mueble). "Calidad
  aprobó" queda solo informativo. Apagado el ajuste, todo vuelve a medirse contra Calidad. La app lo lee con
  `cobroSegunProduccion` (`src/lib/calidad/ajustes-flujo.ts`); si no puede, asume Calidad.
- **Listo para cobrar** = liberado − cobrado (filtro de la O.T. y del reporte; `liberadoArea` en
  `src/lib/estimaciones/pm-cobrado.ts`). Un recibo cobrado de más se **marca al revisarlo**
  (`recibo_contra_calidad`, que trae lo aprobado y lo verificado; `src/app/estimaciones/calidad-recibo.tsx`): es
  un aviso, no bloquea ni le pide motivo al maquilador; se calcula al abrir, así que desaparece al liberarse.
- No cubre el doble cobro (el mueble y también sus componentes por el mismo trabajo): salen juntos en pantalla.

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
