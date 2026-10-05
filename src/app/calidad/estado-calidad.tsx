import ChipEstado from "@/components/chip-estado";
import { estadoCalidad, type AvancePedido } from "@/lib/resumen/avance-items";

// Estado de evaluación de un pedido en la lista de Calidad: de los ítems ya
// liberados a producción, cuántos tienen al menos un informe.
export default function EstadoCalidad({
  cancelado,
  avance,
}: {
  cancelado: boolean;
  avance: AvancePedido | undefined;
}) {
  if (cancelado) return <ChipEstado tono="neutro">Cancelado</ChipEstado>;
  const cuenta = avance ? `${avance.evaluados} de ${avance.liberados} ítems evaluados` : undefined;
  switch (estadoCalidad(avance)) {
    case "evaluado":
      return (
        <ChipEstado tono="ok" titulo={cuenta}>
          Evaluado
        </ChipEstado>
      );
    case "en-proceso":
      return (
        <ChipEstado tono="proceso" titulo={cuenta}>
          {avance!.evaluados}/{avance!.liberados} evaluados
        </ChipEstado>
      );
    case "sin-evaluar":
      return (
        <ChipEstado tono="alerta" titulo={cuenta}>
          Por evaluar
        </ChipEstado>
      );
    default:
      return (
        <ChipEstado tono="neutro" titulo="Producción aún no libera ítems de este pedido">
          Sin liberar
        </ChipEstado>
      );
  }
}
