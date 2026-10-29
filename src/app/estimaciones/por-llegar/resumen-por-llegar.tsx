import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cargarRecibosPorLlegar } from "@/lib/estimaciones/por-llegar-db";
import type { ResumenArea } from "@/lib/estimaciones/por-llegar";
import { money } from "@/lib/estimaciones/motor-precio";
import { AREA_RECIBO_LABELS } from "@/lib/estimaciones/discrepancias-db";

function plural(n: number, uno: string, varios: string): string {
  return `${n.toLocaleString("es-MX")} ${n === 1 ? uno : varios}`;
}

// Cada área tiene su color (borde superior y velo) para distinguirlas de un vistazo.
const TONO_AREA: Record<string, { tarjeta: string; etiqueta: string }> = {
  acabados: { tarjeta: "border-t-brand-500", etiqueta: "text-brand-800" },
  armado: { tarjeta: "border-t-brand-500", etiqueta: "text-brand-800" },
};

function TarjetaArea({ r }: { r: ResumenArea }) {
  const tono = TONO_AREA[r.area] ?? { tarjeta: "border-t-brand-500", etiqueta: "text-slate-600" };
  const hay = r.renglones > 0;
  const calidad = r.enCalidad > 0 && (
    <span className="text-xs text-amber-700">
      {r.enRevision > 0
        ? `${plural(r.enRevision, "unidad espera", "unidades esperan")} la revisión de Calidad (${plural(r.enCalidad, "mueble", "muebles")})`
        : `${plural(r.enCalidad, "mueble entregado", "muebles entregados")} a Calidad`}
    </span>
  );
  return (
    <Link
      href={`/estimaciones/por-llegar#${r.area}`}
      className={`flex flex-col gap-1 rounded-xl border border-slate-200 border-t-4 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${tono.tarjeta}`}
    >
      <span className={`text-sm font-semibold ${tono.etiqueta}`}>
        Trabajo de {AREA_RECIBO_LABELS[r.area].toLowerCase()}
      </span>
      {hay ? (
        <>
          <span className="text-xs text-slate-500">Aprobado por Calidad, listo para cobrar</span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
            {money(r.importe)}
            {r.sinPrecio > 0 && <span className="ml-1 text-sm font-normal text-slate-500">+ sin precio</span>}
          </span>
          <span className="text-sm text-slate-700">
            {plural(r.muebles, "mueble", "muebles")}
            {r.componentes > 0 && ` y ${plural(r.componentes, "componente", "componentes")}`} ·{" "}
            {r.recibosMinimos === 1 ? "falta al menos 1 recibo" : `faltan al menos ${r.recibosMinimos} recibos`}
          </span>
          <span className="truncate font-mono text-xs text-slate-500">O.T. {r.ots.join(", ")}</span>
          {r.sinPrecio > 0 && (
            <span className="text-xs text-amber-700">
              {plural(r.sinPrecio, "modelo", "modelos")} sin precio de referencia: no se pudo estimar su importe
            </span>
          )}
          {calidad}
        </>
      ) : (
        <>
          <span className="text-sm text-slate-500">Todavía no hay trabajo aprobado por cobrar</span>
          {calidad}
        </>
      )}
    </Link>
  );
}

// Bloque del panel de Estimaciones: lo que Calidad ya aprobó y todavía no se cobra.
export default async function ResumenPorLlegar() {
  const supabase = await createClient();
  const { resumen, error } = await cargarRecibosPorLlegar(supabase);

  return (
    <section
      aria-labelledby="por-llegar-titulo"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 border-t-4 border-t-brand-500 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="por-llegar-titulo" className="text-lg font-semibold text-slate-900">
            Recibos por llegar
          </h2>
          <p className="text-xs text-slate-500">
            Trabajo de los equipos externos que Calidad ya aprobó y que todavía no tiene recibo. El importe es
            aproximado: usa el último precio que se pagó por ese mueble.
          </p>
        </div>
        <Link href="/estimaciones/por-llegar" className="rounded-lg bg-brand-100 px-3 py-1.5 text-sm font-semibold text-brand-900 transition-colors hover:bg-brand-200">
          Ver mueble por mueble
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-rose-700">No se pudo calcular: {error}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {resumen.map((r) => (
            <TarjetaArea key={r.area} r={r} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ResumenPorLlegarCargando() {
  return (
    <section
      aria-label="Recibos por llegar"
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <span className="text-base font-semibold text-slate-900">Recibos por llegar</span>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
      </div>
    </section>
  );
}
