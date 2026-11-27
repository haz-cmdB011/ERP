# Notificaciones y avisos

Detalle del módulo: cómo funciona, qué migración hizo cada cosa y las trampas conocidas. Las reglas
generales del proyecto (migraciones, seguridad, flujo de trabajo) están en `CLAUDE.md`. Al cambiar este módulo,
actualizar este archivo.

## Notificaciones del navegador y del celular (Web Push)

Funcionan igual en computadora (Chrome, Edge, Firefox) que en celular. **Al entrar a un área sale un recuadro
"¿Quieres recibir avisos en este navegador?"** (`src/components/pedir-notificaciones.tsx`, en `AreaNav` junto a la
campanita; "Activar" lanza el permiso real del navegador y "Ahora no" no vuelve a salir en ese navegador, se guarda en
`localStorage`); solo aparece si el navegador las soporta, el servidor tiene sus llaves y no están activas ni
bloqueadas. La lógica de activar/desactivar está en el hook `useNotificaciones` (`use-notificaciones.ts`), que
comparten el recuadro y Mi perfil. Cada quien también las activa en **/cuenta → Notificaciones**
(`src/app/cuenta/notificaciones-form.tsx`; también en
`/estimaciones/cuenta`): registra `public/sw.js` (solo atiende `push` y `notificationclick`, sin caché), pide el permiso
y guarda la suscripción del aparato (`POST /api/notificaciones/suscribir`, tabla `suscripciones_push` con RLS: cada
persona solo ve las suyas). "Enviar notificación de prueba" (`/api/notificaciones/prueba`) manda un aviso real a sus
aparatos. En iPhone solo funcionan con la app instalada (`estadoNotificaciones` lo explica). **Para mandar avisos desde el
servidor**: `enviarAUsuarios(ids, { titulo, cuerpo, url, etiqueta })` de `src/lib/notificaciones/enviar.ts` (lee con la clave
de servicio, borra las suscripciones caducadas y nunca lanza). Hace falta configurar `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (ver `.env.example` y `docs/operacion.md`); sin ellas todo sigue igual y la sección
dice que no están configuradas. La dirección de cada suscripción solo se acepta si es de un servicio de push conocido
(`esServicioDePush`, contra SSRF). **Avisos por área (fase 2, migración `avisos_por_area`, aplicada y fusionada el 13 nov 2026)**: cada
aviso nace de un **trigger** de la base, no de la pantalla (no se puede inventar desde el navegador y cubre toda vía:
rutas de servidor o funciones que la app llama directo). Avisos de hechos: Producción registró una entrega → **Calidad**
(una entrega **por partes** del despiece da UN aviso con cada parte y sus piezas, "Producción entregó 6 pz de 2 partes", y si completa
muebles lo dice ahí, "Completa 2 muebles", sin otro aviso por la entrega del mueble que arma la base; `trg_aviso_entrega_parte`,
agrupa por `clave` = asignación + transacción; migración `avisos_entregas_por_partes`); Calidad rechazó un mueble o una parte → **Producción** (a reprocesar,
enlace a Rechazos); Calidad aprobó (lote, parte o revisión final) → **Producción** y, si es de un equipo externo y de Armado o
Acabados, → **Estimaciones** ("ya pueden llegar recibos", enlace a Por llegar; la aprobación del mueble que la base arma sola a partir de
sus partes no repite el aviso; la revisión final solo avisa a Estimaciones si el mueble tuvo asignaciones vigentes de un equipo externo en
Armado o Barniz, y dice cuáles: "Armado y Acabados"); recibo nuevo → **Estimaciones**; recibo revisado → quien lo capturó (el maquilador). **Ya no hay aviso
de "se liberaron muebles"** (migración `avisos_recordatorios`, 17 nov 2026). Los triggers atrapan sus errores: un aviso que falla NUNCA frena el hecho. Tablas `avisos`
(de un área, o de una persona con `destinatario_id`; solo la escriben los triggers) y `avisos_leidos` (quién lo leyó,
aparte porque lo ven varias personas); RLS con `aviso_visible`: el administrador y el trabajador de esa área, el
desarrollador el de cada área en la que entra, el maquilador solo los suyos. **Campanita** (`src/components/campanita.tsx`,
en `AreaNav`; `GET /api/avisos?area=`, `POST /api/avisos/leer`): pregunta cada minuto con la pestaña a la vista y se
esconde sola si la base aún no tiene la tabla. **Al celular** (`despacharAvisos` de `src/lib/notificaciones/despachar.ts`):
reclama con un UPDATE los avisos recientes (15 min) de quien llama y los manda al personal del área (administrador y
trabajador, NO al desarrollador, y sin quien lo provocó) o a la persona del aviso; lo llaman `liberar` y `entregas` y,
para lo que nace de una función directa (Calidad, recibos), la propia lectura de la campanita. Lógica pura y pruebas en
`avisos.ts`. **Falta**: poner las llaves VAPID en Vercel (sin ellas los avisos salen en la campanita pero no al
celular). **Limpieza** (migración
`limpieza_avisos_viejos`): `limpiar_avisos()` borra los avisos de más de 60 días (la campanita muestra 30; sus marcas de
leído se van en cascada y las claves de los recordatorios llevan el día, así que no se regeneran); la llama
`despacharRecordatorios` tras `generar_recordatorios` (sin pg_cron) y, si falla, solo deja aviso en la consola.
