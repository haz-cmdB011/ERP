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
        <Con avance={avance} color="bg-emerald-500">
          <ChipEstado tono="ok" titulo={cuenta}>
            Liberado
          </ChipEstado>
        </Con>
      );
    case "en-proceso":
      return (
        <Con avance={avance} color="bg-brand-500">
          <ChipEstado tono="proceso" titulo={cuenta}>
            {avance!.liberados}/{avance!.total} liberados
          </ChipEstado>
        </Con>
      );
    case "sin-liberar":
      return (
        <Con avance={avance} color="bg-amber-500">
          <ChipEstado tono="alerta" titulo={cuenta}>
            Por liberar
          </ChipEstado>
        </Con>
      );
    default:
      return <ChipEstado tono="neutro">Sin ítems</ChipEstado>;
  }
}

// Chip con una barra fina debajo: se ve de un vistazo qué O.T. van más avanzadas.
function Con({
  avance,
  color,
  children,
}: {
  avance: AvancePedido | undefined;
  color: string;
  children: React.ReactNode;
}) {
  const porcentaje = avance && avance.total > 0 ? Math.round((avance.liberados / avance.total) * 100) : 0;
  return (
    <div className="flex min-w-24 flex-col items-start gap-1">
      {children}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
        aria-label="Avance de liberación"
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  );
}
