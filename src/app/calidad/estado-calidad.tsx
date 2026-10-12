import BarraAvance from "@/components/barra-avance";
import ChipEstado from "@/components/chip-estado";
import { estadoCalidad, type AvancePedido } from "@/lib/resumen/avance-items";

// Estado de evaluación de un pedido en la lista de Calidad: una barra con cuántos de los ítems ya
// liberados a producción tienen al menos un informe (el número va en el tooltip).
export default function EstadoCalidad({
  cancelado,
  avance,
}: {
  cancelado: boolean;
  avance: AvancePedido | undefined;
}) {
  if (cancelado) return <ChipEstado tono="neutro">Cancelado</ChipEstado>;
  const estado = estadoCalidad(avance);
  if (estado === "sin-liberados" || !avance) {
    return (
      <ChipEstado tono="neutro" titulo="Producción aún no libera ítems de este pedido">
        Sin liberar
      </ChipEstado>
    );
  }
  return (
    <BarraAvance
      porcentaje={avance.liberados > 0 ? (avance.evaluados / avance.liberados) * 100 : 0}
      etiqueta={`${avance.evaluados} de ${avance.liberados} ítems evaluados`}
      color={estado === "evaluado" ? "bg-emerald-500" : "bg-brand-500"}
      pendiente={estado === "sin-evaluar"}
    />
  );
}
