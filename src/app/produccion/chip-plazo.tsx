import ChipEstado from "@/components/chip-estado";
import { formatoFecha } from "@/lib/produccion/asignaciones";
import { textoPlazo, type Plazo } from "@/lib/produccion/atrasos";

// Etiqueta del plazo de entrega del PM: roja si ya pasó, ámbar si vence pronto.
// Sin nada que avisar no dibuja nada. `fecha` solo se usa para el tooltip.
export default function ChipPlazo({ plazo, fecha }: { plazo: Plazo; fecha?: string | null }) {
  const texto = textoPlazo(plazo);
  if (!texto) return null;
  return (
    <ChipEstado
      tono={plazo.tipo === "vencido" ? "peligro" : "alerta"}
      titulo={fecha ? `Entrega del pedido: ${formatoFecha(fecha)}` : undefined}
    >
      {texto}
    </ChipEstado>
  );
}
