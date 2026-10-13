import BarraAvance from "@/components/barra-avance";
import ChipEstado from "@/components/chip-estado";
import { estadoLiberacion, type AvancePedido } from "@/lib/resumen/avance-items";

// Estado de liberación de un pedido en la lista de Producción: una barra con cuántos de sus
// ítems vigentes ya se enviaron a producción (el número va en el tooltip).
export default function EstadoLiberacion({
  cancelado,
  avance,
}: {
  cancelado: boolean;
  avance: AvancePedido | undefined;
}) {
  if (cancelado) return <ChipEstado tono="neutro">Cancelado</ChipEstado>;
  const estado = estadoLiberacion(avance);
  if (estado === "sin-items" || !avance) return <ChipEstado tono="neutro">Sin ítems</ChipEstado>;
  const porcentaje = avance.total > 0 ? (avance.liberados / avance.total) * 100 : 0;
  return (
    <BarraAvance
      porcentaje={porcentaje}
      etiqueta={`${avance.liberados} de ${avance.total} ítems liberados`}
      color={estado === "liberado" ? "bg-emerald-500" : "bg-brand-500"}
      pendiente={estado === "sin-liberar"}
    />
  );
}
