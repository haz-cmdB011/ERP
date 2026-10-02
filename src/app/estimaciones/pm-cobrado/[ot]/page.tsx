import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import {
  AREAS_COBRO,
  baseArea,
  cargarOtContraCobrado,
  estadoCelda,
  resumirPorOt,
  tieneDiferencias,
  tienePendienteDeCobro,
  type AreaCobro,
  type EstadoCobro,
  type FilaPmCobrado,
} from "@/lib/estimaciones/pm-cobrado";
import { AREA_RECIBO_LABELS } from "@/lib/estimaciones/discrepancias-db";
import BarraAvance from "../barra-avance";

export const metadata: Metadata = { title: "PM contra cobrado" };

const FILTROS: [string, string][] = [
  ["todos", "Todos"],
  ["diferencias", "Con diferencias"],
  ["por-cobrar", "Por cobrar"],
];

const ESTILO_CELDA: Record<EstadoCobro, string> = {
  no_aplica: "text-slate-300",
  sin_cobro: "text-slate-400",
  parcial: "text-slate-800",
  completo: "font-semibold text-emerald-700",
  excedido: "font-semibold text-rose-700",
  fuera_del_pm: "font-semibold text-rose-700",
};

function Celda({ fila, area }: { fila: FilaPmCobrado; area: AreaCobro }) {
  const estado = estadoCelda(fila, area);
  const cobrado = fila[area];
  const base = baseArea(fila, area);
  if (estado === "no_aplica") {
    return <span className={ESTILO_CELDA[estado]}>—</span>;
  }
  return (
    <span className={`tabular-nums ${ESTILO_CELDA[estado]}`}>
      {base == null ? cobrado : `${cobrado} / ${base}`}
      {estado === "excedido" && base != null && (
        <span className="ml-1 rounded bg-rose-50 px-1 text-[11px] ring-1 ring-rose-200">
          +{cobrado - base}
        </span>
      )}
      {estado === "completo" && <span className="ml-1" aria-label="completo">✓</span>}
    </span>
  );
}

// Detalle de una O.T.: por modelo, lo declarado en todos sus PM contra lo
// cobrado en cada área.
export default async function PmCobradoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ ot: string }>;
  searchParams: Promise<{ ver?: string }>;
}) {
  const ot = decodeURIComponent((await params).ot).trim();
  if (!ot) notFound();
  const { ver } = await searchParams;
  const filtro = FILTROS.some(([v]) => v === ver) ? (ver as string) : "todos";

  const supabase = await createClient();
  if (!puedeVerPrecioSugerido(await getPerfilActual(supabase))) {
    redirect("/estimaciones");
  }

  const { filas, error } = await cargarOtContraCobrado(supabase, ot);
  if (!error && filas.length === 0) notFound();
  const [resumen] = resumirPorOt(filas);
  const base = `/estimaciones/pm-cobrado/${encodeURIComponent(resumen?.ot ?? ot)}`;

  const visibles = filas.filter((f) =>
    filtro === "diferencias"
      ? tieneDiferencias(f) || f.discrepanciasPendientes > 0
      : filtro === "por-cobrar"
        ? tienePendienteDeCobro(f)
        : true
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <Link
          href="/estimaciones/reportes#pm-cobrado"
          className="text-xs font-medium uppercase tracking-wide text-slate-500 hover:text-indigo-600 hover:underline"
        >
          ← Reporte semanal · PM contra cobrado
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          <span className="font-mono">O.T. {resumen?.ot ?? ot}</span>
        </h1>
        {resumen?.proyecto && <p className="text-sm text-slate-600">{resumen.proyecto}</p>}
        {resumen?.pms && (
          <p className="mt-1 font-mono text-xs text-slate-500">
            {resumen.numPms} PM: {resumen.pms}
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          No se pudo cargar: {error}
        </p>
      )}

      {resumen && (
        <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
          {AREAS_COBRO.map((a) => (
            <BarraAvance key={a} etiqueta={AREA_RECIBO_LABELS[a]} avance={resumen.avance[a]} />
          ))}
          {resumen.discrepanciasPendientes > 0 && (
            <p className="text-xs text-amber-800 sm:col-span-3">
              {resumen.discrepanciasPendientes}{" "}
              {resumen.discrepanciasPendientes === 1 ? "discrepancia" : "discrepancias"} sin decidir
              en esta O.T.{" "}
              <Link href="/estimaciones/discrepancias" className="font-medium underline">
                Ir a la bandeja
              </Link>
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        {FILTROS.map(([valor, etiqueta]) => (
          <Link
            key={valor}
            href={
              valor === "todos" ? base : `${base}?ver=${valor}`
            }
            className={`rounded border px-3 py-1 font-medium transition-colors pointer-coarse:py-2 ${
              filtro === valor
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {etiqueta}
          </Link>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          {filtro === "diferencias"
            ? "Ningún modelo tiene diferencias con lo cobrado."
            : "No queda nada por cobrar en esta O.T."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Modelo</th>
                <th className="px-3 py-2.5 text-right">PM (O.T.)</th>
                {AREAS_COBRO.map((a) => (
                  <th key={a} className="px-3 py-2.5 text-right">
                    {AREA_RECIBO_LABELS[a]}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right" title="Reprocesos de Acabados y Armado (no gastan saldo del PM)">
                  Reprocesos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((f, i) => (
                <tr key={`${f.modelo}|${f.descripcion ?? ""}|${i}`} className="align-top transition-colors hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <span className="font-mono font-medium text-slate-900">{f.modelo}</span>
                    {f.discrepanciasPendientes > 0 && (
                      <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                        {f.discrepanciasPendientes} sin decidir
                      </span>
                    )}
                    {f.descripcion && (
                      <span className="block max-w-xs truncate text-xs text-slate-500">
                        {f.descripcion}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {f.cantidadPm == null ? (
                      <span className="text-xs font-medium text-rose-700">no está en la O.T.</span>
                    ) : (
                      <>
                        {f.cantidadPm}
                        {f.cantidadPmIluminacion > 0 && f.cantidadPmIluminacion < f.cantidadPm && (
                          <span className="block text-[11px] text-slate-500">
                            {f.cantidadPmIluminacion} con iluminación
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  {AREAS_COBRO.map((a) => (
                    <td key={a} className="whitespace-nowrap px-3 py-2 text-right">
                      <Celda fila={f} area={a} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {f.reprocesos > 0 ? f.reprocesos : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
