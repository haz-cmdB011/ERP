import { pasoHecho, pasosDelRecibo, type FechasRecibo } from "@/lib/estimaciones/linea-tiempo-recibo";
import { formatoFechaHora } from "@/lib/resumen/entrega";

// "¿Ya se pagó?": los pasos del recibo con su fecha. Lo ve igual el maquilador
// que el personal de Estimaciones.
export default function LineaTiempoRecibo(props: FechasRecibo) {
  const pasos = pasosDelRecibo(props);
  return (
    <ol
      aria-label="Estado del recibo"
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:gap-0"
    >
      {pasos.map((p) => {
        const hecho = pasoHecho(p);
        const cancelado = p.clave === "cancelado";
        return (
          <li key={p.clave} className="flex flex-1 items-start gap-3 sm:flex-col sm:items-start sm:gap-1">
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                cancelado
                  ? "bg-slate-300 text-white"
                  : hecho
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-300 bg-white text-transparent"
              }`}
            >
              {cancelado ? "×" : "✓"}
            </span>
            <span className="flex flex-col">
              <span className={`text-sm font-medium ${hecho ? "text-slate-900" : "text-slate-500"}`}>
                {p.etiqueta}
                {p.actual && !cancelado && (
                  <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-800 ring-1 ring-brand-200">
                    Ahora
                  </span>
                )}
              </span>
              <span className="text-xs text-slate-500">
                {p.fecha ? formatoFechaHora(p.fecha) : hecho ? "En este paso" : "Pendiente"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
