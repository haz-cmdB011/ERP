// Lotes de Calidad: cada entrega de un equipo que Producción ya verificó.
// Calidad evalúa cada lote (cuántas piezas aprueba y cuántas rechaza) con
// evaluar_entrega_calidad; lo rechazado vuelve a Producción como retrabajo y
// regresa como un lote nuevo. Las reglas viven en la migración
// calidad_por_lote_y_retrabajo; aquí solo lo que comparte la interfaz.

import type { Proceso } from "@/lib/produccion/asignaciones";

// Fila de la vista lotes_calidad.
export interface LoteCalidad {
  entrega_id: string;
  asignacion_id: string;
  planeacion_item_id: string | null;
  pedido_id: string | null;
  numero_pedido: string;
  item_code: number | null;
  modelo: string | null;
  descripcion: string | null;
  unidad: string | null;
  proceso: Proceso;
  equipo_id: string;
  equipo: string;
  // Si el lote viene de un retrabajo: el informe que lo rechazó.
  informe_rechazo_id: string | null;
  folio_rechazo: string | null;
  fecha_entrega: string;
  verificada_en: string;
  cantidad: number;
  aprobadas: number;
  rechazadas: number;
  pendiente: number;
  vigente: boolean;
  // Folio de la hoja de entrega en papel: para ubicar la hoja física del lote.
  folio_hoja: string | null;
}

// PostgREST devuelve numeric como texto: se normaliza a número.
export function normalizarLote(f: LoteCalidad): LoteCalidad {
  return {
    ...f,
    cantidad: Number(f.cantidad),
    aprobadas: Number(f.aprobadas),
    rechazadas: Number(f.rechazadas),
    pendiente: Number(f.pendiente),
  };
}

export interface ResumenLotes {
  // Piezas verificadas por Producción (todos los lotes, incluidos retrabajos).
  verificadas: number;
  aprobadas: number;
  rechazadas: number;
  // Piezas de lotes que Calidad todavía no evalúa.
  porEvaluar: number;
  // Piezas rechazadas que todavía no regresan a Calidad corregidas. Cada pieza
  // de un lote de retrabajo que Calidad evalúa (aprobada o rechazada otra vez)
  // cierra una pieza rechazada antes; si la vuelve a rechazar, abre otra.
  enRetrabajo: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function resumirLotes(lotes: Pick<LoteCalidad, "cantidad" | "aprobadas" | "rechazadas" | "pendiente" | "informe_rechazo_id">[]): ResumenLotes {
  let verificadas = 0;
  let aprobadas = 0;
  let rechazadas = 0;
  let porEvaluar = 0;
  let evaluadasDeRetrabajo = 0;
  for (const l of lotes) {
    verificadas += l.cantidad;
    aprobadas += l.aprobadas;
    rechazadas += l.rechazadas;
    porEvaluar += l.pendiente;
    if (l.informe_rechazo_id) evaluadasDeRetrabajo += l.aprobadas + l.rechazadas;
  }
  return {
    verificadas: redondear(verificadas),
    aprobadas: redondear(aprobadas),
    rechazadas: redondear(rechazadas),
    porEvaluar: redondear(porEvaluar),
    enRetrabajo: redondear(Math.max(0, rechazadas - evaluadasDeRetrabajo)),
  };
}

export type EstadoMueble = "en_produccion" | "por_evaluar" | "en_retrabajo" | "aprobado";

// Primero lo que le toca a Calidad (piezas por evaluar), luego lo que espera
// retrabajo en Producción.
export function estadoMueble(r: ResumenLotes): EstadoMueble {
  if (r.verificadas <= 0) return "en_produccion";
  if (r.porEvaluar > 0) return "por_evaluar";
  if (r.enRetrabajo > 0) return "en_retrabajo";
  return "aprobado";
}

// Lotes que Calidad tiene que evaluar: vigentes y con piezas pendientes, del
// que lleva más tiempo esperando al más reciente.
export function lotesPorEvaluar<T extends Pick<LoteCalidad, "vigente" | "pendiente" | "verificada_en" | "numero_pedido">>(
  lotes: T[]
): T[] {
  return lotes
    .filter((l) => l.vigente && l.pendiente > 0)
    .sort(
      (a, b) =>
        a.verificada_en.localeCompare(b.verificada_en) ||
        a.numero_pedido.localeCompare(b.numero_pedido, "es", { numeric: true })
    );
}

// Piezas escritas en el diálogo: vacío = 0, acepta coma decimal. NaN si no es
// un número de cero o más.
export function leerPiezas(texto: string): number {
  const t = texto.trim();
  if (!t) return 0;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? redondear(n) : NaN;
}

// Lo que se escribe en el diálogo de evaluación: números válidos que no pasen
// del lote. Devuelve el error a mostrar o null si se puede enviar.
export function validarEvaluacion(
  aprobadas: number,
  rechazadas: number,
  pendiente: number,
  motivo: string
): string | null {
  if (!Number.isFinite(aprobadas) || !Number.isFinite(rechazadas) || aprobadas < 0 || rechazadas < 0) {
    return "Escribe cantidades válidas (cero o más).";
  }
  if (aprobadas + rechazadas <= 0) return "Indica cuántas piezas apruebas o rechazas.";
  if (redondear(aprobadas + rechazadas) > pendiente) {
    return `El lote solo tiene ${pendiente} pieza${pendiente === 1 ? "" : "s"} por evaluar.`;
  }
  if (rechazadas > 0 && !motivo.trim()) return "Escribe el motivo de las piezas rechazadas.";
  return null;
}
