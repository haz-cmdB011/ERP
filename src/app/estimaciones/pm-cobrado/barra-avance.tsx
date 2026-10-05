import { porcentaje, type AvanceArea } from "@/lib/estimaciones/pm-cobrado";

// Barra de avance de un área: piezas cobradas (sin lo excedido) contra el PM.
export default function BarraAvance({ etiqueta, avance }: { etiqueta: string; avance: AvanceArea }) {
  const pct = porcentaje(avance);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-slate-600">{etiqueta}</span>
        <span className="tabular-nums text-slate-500">
          {pct == null ? "no aplica" : `${avance.cobrado} / ${avance.base} · ${pct}%`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        {pct != null && (
          <div
            className={`anim-crecer-x h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-brand-500"}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}
