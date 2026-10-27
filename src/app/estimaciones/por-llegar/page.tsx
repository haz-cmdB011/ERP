import Link from "next/link";
import Chevron from "@/components/chevron";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import { cargarRecibosPorLlegar } from "@/lib/estimaciones/por-llegar-db";
import {
  AREAS_POR_LLEGAR,
  renglonesSueltos,
  type MuebleEnCalidad,
  type RenglonPorLlegar,
} from "@/lib/estimaciones/por-llegar";
import { fechaCorta, money } from "@/lib/estimaciones/motor-precio";
import { AREA_RECIBO_LABELS } from "@/lib/estimaciones/discrepancias-db";

export const metadata: Metadata = { title: "Recibos por llegar" };

function rutaOt(ot: string): string {
  return `/estimaciones/pm-cobrado/${encodeURIComponent(ot)}`;
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.min(100, (n / total) * 100) : 0;
}

// Qué le falta al mueble para cobrarse, en una frase.
function estado(m: MuebleEnCalidad): { texto: string; tono: string } {
  if (m.porLlegar) return { texto: "Listo para cobrar", tono: "bg-emerald-100 text-emerald-800" };
  if (m.enRevision > 0) return { texto: "En revisión de Calidad", tono: "bg-amber-100 text-amber-800" };
  if (m.aprobados > 0) return { texto: "Aprobado y cobrado", tono: "bg-slate-100 text-slate-700" };
  return { texto: "Entregando partes", tono: "bg-brand-100 text-brand-800" };
}

function Precio({ r }: { r: RenglonPorLlegar }) {
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm">
      <span className="text-emerald-800">
        Por cobrar: <strong className="tabular-nums">{r.listo}</strong>
      </span>
      <span className="font-semibold tabular-nums text-emerald-800" title={precioDe(r)}>
        {r.importe == null ? "sin precio previo" : `≈ ${money(r.importe)}`}
      </span>
    </p>
  );
}

function precioDe(r: RenglonPorLlegar): string {
  if (r.pu == null) return "Sin precio pagado antes";
  return `${money(r.pu)} c/u${r.fechaPrecio ? ` · ${fechaCorta(r.fechaPrecio)}` : ""}${r.folioPrecio ? ` · ${r.folioPrecio}` : ""}`;
}

function TarjetaMueble({ m }: { m: MuebleEnCalidad }) {
  const e = estado(m);
  const faltaEntregar = Math.max(0, m.porCobrar - m.entregados);
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/q/${m.itemId}?area=estimaciones`} className="font-mono font-semibold text-slate-900 hover:underline">
            {m.modelo}
          </Link>
          {m.descripcion && <p className="truncate text-sm text-slate-700">{m.descripcion}</p>}
          <Link href={rutaOt(m.ot)} className="font-mono text-xs text-slate-500 hover:underline">
            O.T. {m.ot}
            {m.itemCodigo ? ` · ${m.itemCodigo}` : ""}
          </Link>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${e.tono}`}>{e.texto}</span>
      </div>

      {/* Muebles completos: aprobado, en revisión y lo que falta entregar. */}
      <div className="flex flex-col gap-1.5">
        <div
          className="flex h-2.5 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`${m.aprobados} aprobados, ${m.enRevision} en revisión de ${m.porCobrar}`}
        >
          <div className="bg-emerald-500" style={{ width: `${pct(m.aprobados, m.porCobrar)}%` }} />
          <div className="bg-amber-400" style={{ width: `${pct(m.enRevision, m.porCobrar)}%` }} />
        </div>
        <p className="text-xs text-slate-600">
          <strong className={`tabular-nums ${m.aprobados > 0 ? "text-emerald-700" : "text-slate-900"}`}>
            {m.aprobados} de {m.porCobrar}
          </strong>{" "}
          aprobados
          {m.enRevision > 0 && ` · ${m.enRevision} en revisión`}
          {faltaEntregar > 0 && ` · ${faltaEntregar} sin entregar`}
          {!!m.cobrado && ` · cobrado ${m.cobrado}`}
        </p>
      </div>

      {m.partes.length > 0 && (
        <details className="group border-t border-slate-100 pt-3 text-xs">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
            <Chevron abierto={false} className="h-3.5 w-3.5 text-slate-500 group-open:rotate-90" />
            {m.partes.length} {m.partes.length === 1 ? "parte" : "partes"}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {m.partes.map((p) => (
              <li key={p.parte} className="flex items-baseline justify-between gap-3">
                <span className="text-slate-700">{p.parte}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  <span className="font-medium text-emerald-700">{p.aprobadas}</span> aprob. · {p.entregadas}/{p.total}{" "}
                  entregadas
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {m.porLlegar && <Precio r={m.porLlegar} />}
    </article>
  );
}

// Lo por cobrar sin tarjeta de mueble (componentes, sobre todo).
function TarjetaSuelta({ r }: { r: RenglonPorLlegar }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="font-mono font-semibold text-slate-900">
          {r.esComponente ? (r.itemCodigo ?? r.modelo) : r.modelo}
        </p>
        {r.esComponente && r.padreModelo && (
          <p className="text-xs text-slate-500">
            Componente de <span className="font-mono">{r.padreModelo}</span>
          </p>
        )}
        {r.descripcion && <p className="truncate text-sm text-slate-700">{r.descripcion}</p>}
        <Link href={rutaOt(r.ot)} className="font-mono text-xs text-slate-500 hover:underline">
          O.T. {r.ot}
        </Link>
      </div>
      <Precio r={r} />
    </article>
  );
}

// Detalle de los recibos por llegar: por área, cada mueble entregado a Calidad con
// lo aprobado y lo que ya se puede cobrar.
export default async function PorLlegarPage() {
  const supabase = await createClient();
  if (!puedeVerPrecioSugerido(await getPerfilActual(supabase))) {
    redirect("/estimaciones");
  }
  const { renglones, resumen, muebles, avisos, error } = await cargarRecibosPorLlegar(supabase);
  const sueltos = renglonesSueltos(renglones, muebles);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Recibos por llegar</h1>
        <p className="mt-1 text-sm text-slate-600">
          Lo entregado a Calidad. Se cobra lo aprobado; importe estimado con el último precio pagado.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          No se pudo cargar: {error}
        </p>
      )}
      {avisos.map((a) => (
        <p key={a} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {a}
        </p>
      ))}

      {AREAS_POR_LLEGAR.map((area) => {
        const r = resumen.find((x) => x.area === area)!;
        const delArea = muebles.filter((m) => m.area === area);
        const sueltosArea = sueltos.filter((x) => x.area === area);
        return (
          <section key={area} id={area} className="flex scroll-mt-20 flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{AREA_RECIBO_LABELS[area]}</h2>
              {r.renglones > 0 && (
                <p className="text-sm text-slate-600">
                  Al menos {r.recibosMinimos} {r.recibosMinimos === 1 ? "recibo" : "recibos"} ·{" "}
                  <strong className="font-semibold text-slate-900">{money(r.importe)}</strong>
                  {r.sinPrecio > 0 && ` + ${r.sinPrecio} sin precio`}
                </p>
              )}
            </div>
            {delArea.length === 0 && sueltosArea.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                Nada entregado a Calidad.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {delArea.map((m) => (
                  <TarjetaMueble key={`${m.itemId}|${m.area}`} m={m} />
                ))}
                {sueltosArea.map((x, i) => (
                  <TarjetaSuelta key={`${x.ot}|${x.modelo}|${x.descripcion ?? ""}|${i}`} r={x} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
