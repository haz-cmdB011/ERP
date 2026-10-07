// Los pasos por los que va un recibo de maquila: capturado -> revisado -> pagado
// (o cancelado). Se arma con las fechas que el propio recibo guarda, así que lo
// ve igual el maquilador que el personal de Estimaciones.

export interface FechasRecibo {
  estado: string;
  guardadoEn: string;
  revisadoEn?: string | null;
  pagadoEn?: string | null;
  canceladoEn?: string | null;
}

export interface PasoRecibo {
  clave: "capturado" | "revisado" | "pagado" | "cancelado";
  etiqueta: string;
  // Instante ISO si el paso ya ocurrió; null si falta.
  fecha: string | null;
  // El paso en el que está ahora el recibo.
  actual: boolean;
}

export function pasosDelRecibo(r: FechasRecibo): PasoRecibo[] {
  if (r.estado === "cancelado") {
    return [
      { clave: "capturado", etiqueta: "Capturado", fecha: r.guardadoEn, actual: false },
      { clave: "cancelado", etiqueta: "Cancelado", fecha: r.canceladoEn ?? null, actual: true },
    ];
  }
  // Un recibo pagado pasó por revisión aunque su fecha no se haya guardado.
  const revisado = r.revisadoEn ?? (r.estado === "pagado" ? r.pagadoEn ?? null : null);
  const pasos: PasoRecibo[] = [
    { clave: "capturado", etiqueta: "Capturado", fecha: r.guardadoEn, actual: r.estado === "pendiente" },
    {
      clave: "revisado",
      etiqueta: "Revisado por Estimaciones",
      fecha: r.estado === "pendiente" ? null : revisado,
      actual: r.estado === "revisado",
    },
    {
      clave: "pagado",
      etiqueta: "Pagado",
      fecha: r.estado === "pagado" ? r.pagadoEn ?? null : null,
      actual: r.estado === "pagado",
    },
  ];
  return pasos;
}

// Un paso está hecho si ya ocurrió o es el actual (aunque falte su fecha).
export function pasoHecho(p: PasoRecibo): boolean {
  return p.fecha !== null || p.actual;
}
