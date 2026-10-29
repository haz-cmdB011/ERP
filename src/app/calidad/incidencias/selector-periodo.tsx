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
    "inline-flex h-10 w-10 items-center justify-center text-lg text-slate-600 transition-colors hover:bg-brand-50";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav aria-label="Periodo" className="flex overflow-hidden rounded-xl border border-slate-300 bg-white text-sm shadow-sm">
        {VISTAS.map((v) => (
          <Link
            key={v}
            href={hrefDe(v, dia)}
            aria-current={v === periodo.vista ? "page" : undefined}
            className={`px-4 py-2 font-semibold transition-colors ${
              v === periodo.vista ? "bg-brand-500 text-on-brand" : "text-slate-600 hover:bg-brand-50"
            }`}
          >
            {NOMBRE_VISTA[v]}
          </Link>
        ))}
      </nav>
      <div className="flex items-center divide-x divide-slate-200 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
        <Link href={hrefDe(periodo.vista, periodo.anterior)} aria-label="Periodo anterior" className={flecha}>
          ‹
        </Link>
        <span className="min-w-[15rem] px-3 text-center text-base font-bold capitalize text-slate-900">
          {etiquetaPeriodo(periodo)}
        </span>
        <Link href={hrefDe(periodo.vista, periodo.siguiente)} aria-label="Periodo siguiente" className={flecha}>
          ›
        </Link>
      </div>
      {!(hoy >= periodo.inicio && hoy <= periodo.fin) && (
        <Link href={hrefDe(periodo.vista, hoy)} className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-900 hover:bg-emerald-200">
          Ir a hoy
        </Link>
      )}
    </div>
  );
}
