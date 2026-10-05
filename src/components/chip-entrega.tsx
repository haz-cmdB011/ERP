import ChipEstado, { type TonoChip } from "./chip-estado";
import { ETIQUETA_ENTREGA, type EstadoEntrega } from "@/lib/resumen/entrega";

const TONO: Record<EstadoEntrega, TonoChip> = {
  semana: "alerta",
  mes: "proceso",
  futura: "ok",
  pasada: "neutro",
  "sin-fecha": "neutro",
};

// Etiqueta junto a la fecha de entrega. "Sin fecha" no se dibuja: ya lo dice
// el guion de la celda.
export default function ChipEntrega({ estado }: { estado: EstadoEntrega }) {
  if (estado === "sin-fecha") return null;
  return <ChipEstado tono={TONO[estado]}>{ETIQUETA_ENTREGA[estado]}</ChipEstado>;
}
