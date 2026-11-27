# Operación: qué hacer si…

Guía rápida para cuando algo falla en producción. Para las defensas y los pasos de
seguridad, ver [`SEGURIDAD.md`](../SEGURIDAD.md); para trabajar en el código,
[`onboarding.md`](onboarding.md).

## Cómo nos enteramos de que algo falla

| Qué | Cómo se activa | Qué avisa |
|---|---|---|
| **Fallos del servidor y de las pantallas** | Definir `ALERTA_WEBHOOK_URL` en Vercel y redesplegar | Un mensaje al canal con ruta, tipo de fallo, texto recortado y el **Código** (digest) |
| **El sitio dejó de responder** | Monitor externo apuntando a `/api/salud` | Correo o app del monitor cuando responde 503 o no responde |

### Activar los avisos de fallos (una vez)

1. Crear un webhook entrante en el canal donde quieran enterarse:
   - **Slack:** *Apps → Incoming Webhooks* → agregar al canal → copiar la URL.
   - **Discord:** canal → *Editar canal → Integraciones → Webhooks → Nuevo webhook* → copiar la URL.
2. En Vercel → *Settings → Environment Variables*: `ALERTA_WEBHOOK_URL` = esa URL (solo `https://`).
   Redesplegar.
3. Comprobar: provocar un error en una vista previa (o pedir a desarrollo que lance uno de prueba).

Detalles: no se manda nada en desarrollo local; el mismo fallo no se repite durante 10 minutos;
los correos del texto se tapan y la ruta se manda sin parámetros. El código se genera en
`src/instrumentation.ts` (servidor) y `src/app/error.tsx` → `/api/errores` (navegador).

### Monitor de disponibilidad (una vez)

Cualquier servicio gratuito sirve (UptimeRobot, Better Stack…):

1. Crear un monitor **HTTP(s)** a `https://<dominio-del-sitio>/api/salud`, cada 5 minutos.
2. (Opcional) Que busque el texto `"ok":true`.
3. Dirigir las alertas a quien esté de guardia.

`/api/salud` responde **200** si la app y la base contestan, y **503** si la base no responde. Cada
llamada consulta la base, así que en el plan gratuito de Supabase también cuenta como actividad
y ayuda a que el proyecto no se pause por inactividad (no sustituye a un plan de pago ni a respaldos).

## Si el sitio no abre o da error

1. **¿Es la base?** Abrir `https://<dominio>/api/salud`. Si responde 503, el problema es Supabase:
   - En el panel de Supabase, ¿el proyecto aparece **pausado**? (Pasa en el plan gratuito tras una
     semana sin actividad.) Usar *Restore project* y esperar unos minutos.
   - Si no está pausado, revisar `status.supabase.com` y *Logs* del proyecto.
2. **¿Es el despliegue?** Vercel → *Deployments*. Si el último despliegue es el que rompió algo:
   abrir el anterior que funcionaba y **Promote to Production** (regreso inmediato) mientras se
   corrige. Luego arreglar en una rama y abrir un PR como siempre.
3. **¿Es una pantalla concreta con "Algo salió mal"?** Anotar el **Código** que muestra (o el que
   llegó en el aviso) y buscarlo en Vercel → *Logs*. Ahí está el error completo.

## Si una persona no puede entrar

| Caso | Qué hacer |
|---|---|
| Olvidó la contraseña | En el login, *¿Olvidaste tu contraseña?*: le llega un enlace que abre la pantalla de contraseña nueva (`/auth/restablecer`). La contraseña ya no se cambia desde Mi perfil. Si no le llega el correo, un **desarrollador** la restablece en *Administración → Usuarios*. |
| Se registró y no ve nada | Es normal: el rol `usuario` no ve datos. Un administrador le asigna **rol y área** en *Administración → Usuarios*. |
| Perdió el celular con la verificación en dos pasos | En el panel de Supabase → *Authentication → Users* → su usuario → eliminar sus factores de autenticación (MFA; el nombre exacto de la opción puede variar en el panel). Después entra con su contraseña y la vuelve a activar en *Mi perfil*. |
| Dice "Demasiados intentos" | Es el límite de intentos. Esperar el tiempo indicado (el registro permite 5 por IP cada 15 minutos). Si es la oficina entera detrás de una misma IP, avisar a desarrollo. |
| Dice que el registro está pausado | Se crearon 20 cuentas en una hora (freno contra abuso). Que un administrador cree la cuenta a mano. |

## Si falla algo de la carga de Excel

- *"El archivo no es un libro de Excel… válido"*: no es un `.xlsx`/`.xlsm` real (por ejemplo un archivo
  renombrado) o está dañado. Volver a guardarlo desde Excel.
- *"…excede el tamaño máximo"*: tope de 40 MB.
- Errores de estructura del pedido: el mensaje indica hoja y fila.

## Respaldo de la base

Supabase **no guarda respaldos automáticos** mientras el proyecto siga en el plan gratuito (confirmarlo en
*Settings → Database → Backups*). Por eso hay un respaldo manual:

```bash
npm run db:respaldo                   # todo: tablas, usuarios y archivos de Storage
npm run db:respaldo -- --sin-archivos # sin descargar los archivos (solo su lista)
```

- **Solo lee**: no cambia nada en la base. Usa la clave de servicio de `.env.local`.
- Deja una carpeta `respaldos/<AAAA-MM-DD_HHMM>/` con `tablas/<tabla>.json` (las 50 tablas), `usuarios.json`
  (sin contraseñas: la API no las da), `archivos/` (Storage), `archivos.json` y `manifiesto.json` (cuántas filas
  trae cada tabla, la última migración del repo y si quedó completo).
- Compara las filas guardadas con las que cuenta la base; si algo no cuadra, lo dice y termina con error: **un
  respaldo que termina en error no sirve**, hay que repetirlo.
- El esquema (tablas, funciones, reglas) no va en el respaldo: está en `supabase/migrations/`.
- **La carpeta `respaldos/` trae datos reales** (nombres, correos, recibos): está en `.gitignore` y nunca se sube
  a Git. Guárdala en un lugar seguro (el Drive de la empresa o un disco externo) y borra la copia local.
- **Cuándo**: una vez por semana y **antes de cualquier cambio grande** (una migración que borra o mueve datos,
  una limpieza, una importación masiva). El 27 nov 2026 tardó menos de un minuto.

## Si hay que restaurar datos

- **Pocas filas borradas o cambiadas por error**: buscarlas en el respaldo más reciente
  (`respaldos/<fecha>/tablas/<tabla>.json`) y volver a insertarlas o corregirlas. Hacerlo con cuidado: lo que
  pasó después del respaldo no está ahí. El historial de *Administración → Auditoría* ayuda a ver qué cambió.
- **Perder el proyecto completo**: crear uno nuevo, aplicar todas las migraciones del repo, crear los usuarios
  con su mismo id (`usuarios.json`; cada quien restablece su contraseña), cargar las tablas empezando por las
  que no dependen de otras (`proyectos`, `pedidos`, `pedido_versiones`, `planeacion_items`…) y subir los
  archivos de `archivos/` a sus buckets. **No está automatizado ni se ha ensayado**: hacerlo con calma y, si se
  puede, ensayarlo antes en un proyecto aparte.
- Los registros importantes ya tienen historial de cambios (*Administración → Auditoría*), que ayuda a
  reconstruir qué pasó, pero no sustituye a un respaldo.

## Si se sospecha que se filtró una clave

Seguir el procedimiento de **rotar la clave secreta** de [`SEGURIDAD.md`](../SEGURIDAD.md). No pegar
claves en chats, issues ni commits.

## Si Calidad no puede evaluar un mueble

Calidad solo **evalúa** muebles que Producción ya preaprobó (más lo que ya tiene informes, como
historial). La preaprobación se hace al **registrar la entrega**: quien toma la foto de la hoja marca si
las piezas *cumplen* (pasan a Calidad) o *no cumplen* (regresan al equipo con motivo). Lo que sigue en
taller, sin asignar o con la entrega sin decidir **sí se ve**, abajo en "En taller", con los botones de
aprobar deshabilitados y el motivo (dónde está en Producción); ahí Calidad puede **reportar una falla**.
Si Calidad pregunta por qué no puede aprobar un mueble, revisar en Producción → Control de asignaciones
si falta registrar la entrega o preaprobarla (las entregas viejas sin decisión se revisan ahí).

Si hay que dejar que Calidad evalúe sin preaprobación (emergencia), se apaga desde el SQL Editor y queda
registrado en la base:

```sql
update public.ajustes_flujo set activo = false, actualizado_en = now()
  where clave = 'verificacion_produccion';
```

Con `activo = true` vuelve el flujo normal. Mientras esté apagado, las entregas nacen preaprobadas y
Calidad puede evaluar un mueble completo sin entrega. Al volver a encenderlo, anotar el periodo en
`PERIODOS_SIN_VERIFICACION` de `tests-db/produccion-calidad.test.ts` (esos informes no siguen las reglas
normales).

## Revisión final del mueble

Calidad revisa el **mueble completo** antes de mandarlo a obra, no cada proceso (revisar un lote queda
como opción si hay una falla en ese proceso). La revisión final está detrás del ajuste `revision_final`; se
enciende **después de fusionar** la versión que pide dónde nació la falla (migración
`revision_final_obligatoria`). Apagada no cambia nada. Encendida:

- En Calidad (detalle del PM) aparece "Revisión final" con los muebles que Producción ya verificó en el
  último paso de su ruta (no hace falta que Calidad apruebe cada lote). Cada resultado lleva folio `FIN-`.
- Lo rechazado lleva el motivo, **dónde nació la falla** (un paso de la ruta o un área: Ingeniería,
  Planeación, Compras o proveedor, Diseño, otra) y el paso al que regresa. Aparece en Producción → Rechazado
  por Calidad para reasignarlo. Desde ese paso sigue el resto de la ruta (se reasigna paso por paso) y,
  cuando Producción lo vuelve a verificar en el último paso, regresa a la revisión final.
- En Producción el mueble dice "Revisión final x/y" y, cuando se aprueba completo, "Liberado a obra".
- No cambia el cobro de los maquiladores (ver la sección siguiente).

Para encenderla (o apagarla con `false`) desde el SQL Editor:

```sql
update public.ajustes_flujo set activo = true, actualizado_en = now()
  where clave = 'revision_final';
```

## Contra qué se cobra (Estimaciones)

Calidad revisa el mueble completo y no cada proceso, así que en Estimaciones "Listo para cobrar" y el aviso
de "cobrado de más" al revisar un recibo se miden contra lo que **Producción verificó** al registrar la
entrega (ajuste `cobro_segun_produccion`, encendido desde el 20 oct 2026 y **apagado el 3 nov 2026**: hoy manda lo que aprobó Calidad, y la base no deja guardar un recibo que cobre más que el PM ni más que lo aprobado). Lo que aprobó Calidad se sigue
mostrando en gris, solo como dato. Un componente se da por liberado en la misma proporción que su mueble.

Si se decide que vuelva a mandar Calidad, apagarlo desde el SQL Editor (con `true` regresa a Producción):

```sql
update public.ajustes_flujo set activo = false, actualizado_en = now()
  where clave = 'cobro_segun_produccion';
```

## Notificaciones del navegador y del celular

Al entrar a un área sale un recuadro que las ofrece (o se activan en **Mi perfil → Notificaciones**), por aparato y navegador; en iPhone, con la app instalada. Para que
funcionen el servidor necesita tres variables, en Vercel (Production) y en `.env.local` si se prueba en local:

1. Generar las llaves, **una sola vez**: `npx web-push generate-vapid-keys`.
2. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = la llave pública; `VAPID_PRIVATE_KEY` = la privada (solo servidor);
   `VAPID_SUBJECT` = `mailto:` de quien administra el sistema.
3. Aplicar la migración `suscripciones_push` (tabla con RLS) y volver a desplegar: la llave pública se incrusta al compilar.

Si cambian las llaves, las suscripciones guardadas dejan de servir: cada persona debe tocar *Desactivar* y *Activar*
otra vez. Si una notificación de prueba da 503, faltan las variables; 409, ese aparato no la tiene activada; 502, el
servicio de push rechazó el envío (suscripción caducada: se limpia sola). Sin las llaves el ERP sigue funcionando igual.

### Avisos por área y campanita

Con las migraciones `avisos_por_area` y `avisos_recordatorios` aplicadas, la base crea sola un aviso cuando: Producción registra una
entrega, completa o por partes del despiece (→ Calidad; la de partes es un solo aviso con cada parte y, si completa muebles, cuántos);
Calidad rechaza un mueble o una parte (→ Producción, a reprocesar); Calidad aprueba (→ Producción y, si se puede cobrar —trabajo de un
equipo externo en Armado o Acabados—, → Estimaciones: "ya pueden llegar recibos"); llega un recibo (→ Estimaciones); y se revisa un recibo (→ quien lo capturó).
Además hay **recordatorios** que se repiten una vez al día mientras sigan pendientes: muebles liberados sin asignar tras 2 días (a quien
los liberó), asignaciones sin entregar tras 3 días (a toda Producción), recibos sin revisar tras 3 días y recibos revisados sin pagar
tras 3 días (a Estimaciones). Se ven en la **campanita** de la barra (cada área ve los suyos; el desarrollador, los del área
en la que está) y, si la persona activó las notificaciones y las llaves están puestas, también le llegan al celular (al
personal del área, no al desarrollador, y nunca a quien provocó el aviso).

- La campanita no sale hasta que la migración esté aplicada. Los avisos al celular no salen sin las llaves.
- Un aviso que no se pudo crear **no frena** la operación (liberar, entregar, evaluar…): solo no aparece.
- Los avisos de más de 30 días ya no se muestran; no se borran solos. Para limpiar: `delete from public.avisos where creado_en < now() - interval '90 days';`
- Los recordatorios se generan cuando alguien abre la campanita (no hay tarea programada). Para cambiar los días: migración nueva que
  reemplace los valores por omisión de `generar_recordatorios`. Para apagarlos: `revoke execute on function public.generar_recordatorios(integer, integer, integer, integer) from service_role;`
- Para apagar los avisos de hechos sin quitar nada más: `alter table public.entregas_produccion disable trigger trg_aviso_entrega;` y lo mismo con
  `trg_aviso_informe_calidad`, `trg_aviso_revision_final`, `trg_aviso_recibo_nuevo` y `trg_aviso_recibo_revisado` (cada una en su tabla; ver la migración).

## Cambios de base de datos

Siempre como archivo nuevo en `supabase/migrations/`, aplicado por **una sola vía** y verificado con
`npm run db:verificar` (ver `CLAUDE.md`).

**Cuándo aplicarla**: la base es una sola y la comparte todo el equipo, así que una migración aplicada ya
está "en producción" aunque su PR no se haya fusionado. Para que la base y `main` no se separen:

1. Abrir el PR con la migración y esperar el CI en verde.
2. Aplicar la migración **justo antes de fusionar** (no al abrir el PR) y verificarla.
3. Fusionar **ese mismo día**. Si el código nuevo depende de la migración, nunca fusionar antes de aplicarla.
4. Si un PR con la migración ya aplicada se cierra sin fusionar, **deshacerla** con su bloque "Para deshacer"
   (otra migración) o fusionar al menos el archivo, para que la base no quede con algo que el repo no tiene.

Si para probar la vista previa de Vercel hace falta la migración, se puede aplicar antes, pero entonces el
PR se fusiona ese mismo día. Antes de una migración que borra o mueve datos, correr `npm run db:respaldo`.

## Ajustes de GitHub (los hace un administrador del repositorio)

Hoy cualquiera con permiso de escritura puede subir cambios directo a `main` sin PR ni CI. Nadie lo hace
(en los 60 días previos al 27 nov 2026 todo entró por PR), así que protegerla **no cambia cómo trabajamos**:
solo impide saltarse el camino por error. Lo hace quien administra el repositorio, en GitHub:

1. *Settings → Rules → Rulesets → New branch ruleset* (o *Settings → Branches → Add rule*), para la rama
   `main`, en estado **Active**:
   - **Require a pull request before merging**: sí, con **0 aprobaciones** requeridas (cada quien sigue
     fusionando sus PR, como hoy).
   - **Require status checks to pass**: sí, el check **"Lint, pruebas y build"** (el del CI). Dejar **apagado**
     "Require branches to be up to date before merging": si se enciende, cada PR tendría que actualizarse con
     `main` antes de fusionar, y eso sí cambia el flujo.
   - **Block force pushes** y **Restrict deletions**: sí.
   - **Bypass list**: solo el administrador del repositorio, para emergencias.
2. *Settings → General → Pull Requests*: encender **Automatically delete head branches**. Así la rama de un
   PR se borra sola al fusionarlo (se puede recuperar desde el PR con "Restore branch").

Qué no cambia: Vercel sigue publicando al fusionar en `main`; los PR de Dependabot pasan por el mismo CI; la
fusión sigue siendo manual con *merge commit*. El CI corre en todo PR (sin filtros de carpetas), así que el
check obligatorio no puede dejar un PR atorado.

## Base de pruebas (pendiente)

Hoy la app local, las pruebas, las vistas previas de Vercel y la app real usan **la misma base** de producción.
Una base de pruebas aparte evitaría que un error al probar toque datos reales, y permitiría probar
automáticamente los flujos con sesión (ver abajo). No se ha hecho porque el plan gratuito de Supabase deja 2
proyectos **activos por cuenta** (cuentan los de todas las organizaciones de quien lo crea): el 7 oct 2026 se
rechazó aunque `simulador-sistemas` ya estaba en pausa, porque la cuenta que lo intentó tenía otro proyecto
activo en otra organización. Lo puede crear alguien cuya cuenta tenga lugar (por ejemplo, el dueño de la
organización, haz-cmdB011) o se pausa ese otro proyecto. Lo decide quien administra la cuenta de Supabase. Si se crea:

1. Proyecto nuevo (gratis) en la misma organización; aplicarle todas las migraciones del repo.
2. Cada quien cambia **su** `.env.local` a la base de pruebas para trabajar en local. Producción no cambia.
3. Opcional: que las vistas previas de Vercel usen la base de pruebas (variables de entorno de *Preview*).

Eso sí cambia una costumbre: lo que se prueba en local ya no aparece en producción. Por eso es una decisión
del equipo, no un ajuste automático.

## Lo que todavía no se puede probar automáticamente

Las pruebas de navegador (`npm run test:e2e`, también en el CI) cubren lo público: login, registro,
aviso de privacidad, 404, redirecciones, cabeceras de seguridad y el diseño en celular. Los flujos con
sesión (subir un Excel, liberar a Producción, capturar y pagar un recibo, el escáner de QR) necesitan una
**base de pruebas** que hoy no existe; cuando exista, esos flujos son lo primero que conviene añadir.
