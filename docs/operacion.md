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
| Olvidó la contraseña | En el login, *¿Olvidaste tu contraseña?*. Si no le llega el correo, un **desarrollador** la restablece en *Administración → Usuarios*. |
| Se registró y no ve nada | Es normal: el rol `usuario` no ve datos. Un administrador le asigna **rol y área** en *Administración → Usuarios*. |
| Perdió el celular con la verificación en dos pasos | En el panel de Supabase → *Authentication → Users* → su usuario → eliminar sus factores de autenticación (MFA; el nombre exacto de la opción puede variar en el panel). Después entra con su contraseña y la vuelve a activar en *Mi perfil*. |
| Dice "Demasiados intentos" | Es el límite de intentos. Esperar el tiempo indicado (el registro permite 5 por IP cada 15 minutos). Si es la oficina entera detrás de una misma IP, avisar a desarrollo. |
| Dice que el registro está pausado | Se crearon 20 cuentas en una hora (freno contra abuso). Que un administrador cree la cuenta a mano. |

## Si falla algo de la carga de Excel

- *"El archivo no es un libro de Excel… válido"*: no es un `.xlsx`/`.xlsm` real (por ejemplo un archivo
  renombrado) o está dañado. Volver a guardarlo desde Excel.
- *"…excede el tamaño máximo"*: tope de 40 MB.
- Errores de estructura del pedido: el mensaje indica hoja y fila.

## Si hay que restaurar datos

- **Hoy no hay respaldos automáticos** mientras el proyecto de Supabase siga en el plan gratuito
  (confirmarlo en *Settings → Database → Backups*). Esto es un riesgo conocido: ver las opciones
  (plan Pro, o un respaldo programado) en `SEGURIDAD.md` / la lista de pendientes del equipo.
- Cuando existan respaldos, anotar aquí el procedimiento exacto y probarlo una vez.
- Los registros importantes ya tienen historial de cambios (*Administración → Auditoría*), que ayuda a
  reconstruir qué pasó, pero no sustituye a un respaldo.

## Si se sospecha que se filtró una clave

Seguir el procedimiento de **rotar la clave secreta** de [`SEGURIDAD.md`](../SEGURIDAD.md). No pegar
claves en chats, issues ni commits.

## Cambios de base de datos

Siempre como archivo nuevo en `supabase/migrations/`, aplicado por **una sola vía** y verificado con
`npm run db:verificar` (ver `CLAUDE.md`). Si el código nuevo depende de una migración, aplicar la
migración **antes** de fusionar el PR.

## Lo que todavía no se puede probar automáticamente

Las pruebas de navegador (`npm run test:e2e`, también en el CI) cubren lo público: login, registro,
aviso de privacidad, 404, redirecciones, cabeceras de seguridad y el diseño en celular. Los flujos con
sesión (subir un Excel, liberar a Producción, capturar y pagar un recibo, el escáner de QR) necesitan una
**base de pruebas** que hoy no existe; cuando exista, esos flujos son lo primero que conviene añadir.
