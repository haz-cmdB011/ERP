import ChipEstado from "@/components/chip-estado";
import { estadoLiberacion, type AvancePedido } from "@/lib/resumen/avance-items";

// Estado de liberación de un pedido en la lista de Producción: cuántos de sus
// ítems vigentes ya se enviaron a producción.
export default function EstadoLiberacion({
  cancelado,
  avance,
}: {
  cancelado: boolean;
  avance: AvancePedido | undefined;
}) {
  if (cancelado) return <ChipEstado tono="neutro">Cancelado</ChipEstado>;
  const estado = estadoLiberacion(avance);
  const cuenta = avance ? `${avance.liberados} de ${avance.total} ítems liberados` : undefined;
  switch (estado) {
    case "liberado":
      return (
        <ChipEstado tono="ok" titulo={cuenta}>
          Liberado
        </ChipEstado>
      );
    case "en-proceso":
      return (
        <ChipEstado tono="proceso" titulo={cuenta}>
          {avance!.liberados}/{avance!.total} liberados
        </ChipEstado>
      );
    case "sin-liberar":
      return (
        <ChipEstado tono="alerta" titulo={cuenta}>
          Por liberar
        </ChipEstado>
      );
    default:
      return <ChipEstado tono="neutro">Sin ítems</ChipEstado>;
  }
}
