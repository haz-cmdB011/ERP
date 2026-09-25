import { ESTADO_NOMBRE, type EstadoRecibo } from "@/lib/estimaciones/recibos-db";

const ESTILO: Record<EstadoRecibo, string> = {
  pendiente: "bg-amber-50 text-amber-700 ring-amber-200",
  revisado: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  pagado: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelado: "bg-slate-100 text-slate-500 ring-slate-200",
};

export default function EstadoReciboBadge({ estado }: { estado: EstadoRecibo }) {
  return (
    <span
      className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ring-1 ${ESTILO[estado]}`}
    >
      {ESTADO_NOMBRE[estado]}
    </span>
  );
}
