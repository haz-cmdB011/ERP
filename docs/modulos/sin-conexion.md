# Capturas sin conexión

Detalle del módulo: cómo funciona, qué migración hizo cada cosa y las trampas conocidas. Las reglas
generales del proyecto (migraciones, seguridad, flujo de trabajo) están en `CLAUDE.md`. Al cambiar este módulo,
actualizar este archivo.

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
