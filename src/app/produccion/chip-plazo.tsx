import IconoMenu from "@/components/iconos-menu";
import { formatoFecha } from "@/lib/produccion/asignaciones";
import { textoPlazo, type Plazo } from "@/lib/produccion/atrasos";

// Aviso del plazo de entrega del PM: solo un reloj que cambia de color según cuánto falta
// (rojo si ya pasó, naranja hoy o en 1-2 días, ámbar en 3-4, lima en 5-7). El texto
// ("Vence en 3 d") queda en el tooltip y para lectores de pantalla. Sin nada que avisar no
// dibuja nada. `fecha` solo se usa para el tooltip.
function colorPlazo(plazo: Plazo): string {
  if (plazo.tipo === "vencido") return "bg-rose-50 text-rose-800 ring-rose-200";
  if (plazo.tipo === "hoy" || (plazo.tipo === "por-vencer" && plazo.dias <= 2))
    return "bg-orange-50 text-orange-800 ring-orange-200";
  if (plazo.tipo === "por-vencer" && plazo.dias <= 4) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-lime-50 text-lime-800 ring-lime-200";
}

export default function ChipPlazo({ plazo, fecha }: { plazo: Plazo; fecha?: string | null }) {
  const texto = textoPlazo(plazo);
  if (!texto) return null;
  return (
    <span
      title={fecha ? `${texto} · entrega del pedido: ${formatoFecha(fecha)}` : texto}
      className={`inline-flex shrink-0 items-center justify-center rounded-full p-1.5 ring-1 ${colorPlazo(plazo)}`}
    >
      <IconoMenu nombre="reloj" className="h-4 w-4" />
      <span className="sr-only">{texto}</span>
    </span>
  );
}
