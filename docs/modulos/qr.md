# QR del mueble y trazabilidad

Detalle del módulo: cómo funciona, qué migración hizo cada cosa y las trampas conocidas. Las reglas
generales del proyecto (migraciones, seguridad, flujo de trabajo) están en `CLAUDE.md`. Al cambiar este módulo,
actualizar este archivo.

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
