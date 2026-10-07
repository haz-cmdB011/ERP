// "Entregado por Producción, sin inspeccionar": ítems que Producción ya entregó
// (total o parcialmente) y que Calidad todavía no evalúa o no ha vuelto a
// evaluar desde la última entrega. Puro.

export interface EntregaDeItem {
  itemId: string;
  pedidoId: string;
  numeroPedido: string;
  modelo: string | null;
  itemCode: number;
  // Piezas entregadas hasta hoy (suma de las asignaciones) y de las asignadas.
  entregado: number;
  asignado: number;
  unidad: string | null;
  // Fecha (AAAA-MM-DD) de la última entrega.
  ultimaEntrega: string;
}

export interface InformeDeItem {
  aprobado: boolean;
  // Instante ISO en que se evaluó.
  elaboradoEn: string;
}

export type MotivoInspeccion = "sin_evaluar" | "reinspeccion" | "entrega_nueva";

export interface PorInspeccionar extends EntregaDeItem {
  motivo: MotivoInspeccion;
}

// Zona de la empresa: "2026-10-07" es un día de Ciudad de México, no UTC.
function diaLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// `ultimoInforme` trae el informe más reciente de cada ítem. Entra a la lista
// quien:
//  - nunca se evaluó;
//  - su último informe fue "No aprobado" (espera reinspección);
//  - tuvo entregas después del día de su última evaluación (piezas nuevas).
// Primero lo que lleva más tiempo esperando.
export function porInspeccionar(
  entregas: EntregaDeItem[],
  ultimoInforme: Map<string, InformeDeItem>
): PorInspeccionar[] {
  const salida: PorInspeccionar[] = [];
  for (const e of entregas) {
    if (!(e.entregado > 0)) continue;
    const inf = ultimoInforme.get(e.itemId);
    if (!inf) salida.push({ ...e, motivo: "sin_evaluar" });
    else if (!inf.aprobado) salida.push({ ...e, motivo: "reinspeccion" });
    else if (e.ultimaEntrega > diaLocal(inf.elaboradoEn)) salida.push({ ...e, motivo: "entrega_nueva" });
  }
  return salida.sort(
    (a, b) => a.ultimaEntrega.localeCompare(b.ultimaEntrega) || a.numeroPedido.localeCompare(b.numeroPedido, "es", { numeric: true })
  );
}

export const MOTIVO_NOMBRE: Record<MotivoInspeccion, string> = {
  sin_evaluar: "Sin evaluar",
  reinspeccion: "Por reinspeccionar",
  entrega_nueva: "Entrega nueva",
};
