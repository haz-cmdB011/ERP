// Qué hace Calidad con un mueble desde su QR (/q/<ítem>). Calidad revisa el mueble
// completo (revisión final) antes de mandarlo a obra; revisar una entrega de un proceso
// queda como opción para cuando hay una falla ahí. Con la revisión final apagada, lo
// único que hay son las entregas. Sin base de datos, para poder probarlo.

export type EstadoRevisionFinalQr =
  // Calidad ya aprobó la cantidad del mueble.
  | "liberado"
  // Hay piezas listas y quien escanea puede revisarlas.
  | "revisar"
  // Hay piezas listas, pero quien escanea no puede evaluar.
  | "listas"
  // Producción todavía no verifica piezas en el último paso de la ruta.
  | "esperando";

export interface PanelCalidadQr {
  // null: la revisión final está apagada (o el mueble no tiene resumen).
  revisionFinal: EstadoRevisionFinalQr | null;
  // Las entregas por proceso van plegadas cuando la revisión final es la puerta a obra.
  entregasPlegadas: boolean;
}

export function panelCalidadQr(
  resumen: { pendientes: number; liberado_a_obra: boolean } | null,
  puedeEvaluar: boolean
): PanelCalidadQr {
  if (!resumen) return { revisionFinal: null, entregasPlegadas: false };
  const revisionFinal: EstadoRevisionFinalQr = resumen.liberado_a_obra
    ? "liberado"
    : resumen.pendientes > 0
      ? puedeEvaluar
        ? "revisar"
        : "listas"
      : "esperando";
  return { revisionFinal, entregasPlegadas: true };
}
