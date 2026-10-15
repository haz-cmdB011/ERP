import Link from "next/link";
import { VISTAS, type Periodo, type Vista } from "@/lib/calidad/incidencias";
import { NOMBRE_VISTA, etiquetaPeriodo } from "./formato";

// Pestañas Día / Semana / Mes / Año, con flechas para ir al periodo anterior o
// al siguiente y un atajo a hoy. Cambiar de pestaña conserva el día que se mira.
export default function SelectorPeriodo({
  periodo,
  dia,
  hoy,
  hrefDe,
}: {
  periodo: Periodo;
  // Día que se está mirando: al cambiar de pestaña se conserva.
  dia: string;
  hoy: string;
  hrefDe: (vista: Vista, dia: string) => string;
}) {
  const flecha =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav aria-label="Periodo" className="flex overflow-hidden rounded-lg border border-slate-300 bg-white text-sm">
        {VISTAS.map((v) => (
          <Link
            key={v}
            href={hrefDe(v, dia)}
            aria-current={v === periodo.vista ? "page" : undefined}
            className={`px-4 py-1.5 font-medium transition-colors ${
              v === periodo.vista ? "bg-brand-500 text-on-brand" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {NOMBRE_VISTA[v]}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <Link href={hrefDe(periodo.vista, periodo.anterior)} aria-label="Periodo anterior" className={flecha}>
          ‹
        </Link>
        <span className="min-w-[14rem] text-center text-sm font-semibold capitalize text-slate-900">
          {etiquetaPeriodo(periodo)}
        </span>
        <Link href={hrefDe(periodo.vista, periodo.siguiente)} aria-label="Periodo siguiente" className={flecha}>
          ›
        </Link>
      </div>
      {!(hoy >= periodo.inicio && hoy <= periodo.fin) && (
        <Link href={hrefDe(periodo.vista, hoy)} className="text-sm text-slate-500 underline hover:text-slate-700">
          Ir a hoy
        </Link>
      )}
    </div>
  );
}
