export type EstadoRevision = "en_revision" | "cancelado" | null;

export const ESTADO_REVISION_LABELS: Record<NonNullable<EstadoRevision>, string> = {
  en_revision: "En revisión",
  cancelado: "Cancelado",
};

// Usado tanto en Planeación (donde se puede editar) como en Producción
// (donde solo se refleja, de solo lectura) — misma fuente para que el
// color de la fila sea consistente entre áreas.
export function colorFilaEstadoRevision(estado: EstadoRevision): string {
  if (estado === "en_revision") return "bg-orange-100";
  if (estado === "cancelado") return "bg-red-100";
  return "";
}
