import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual } from "@/lib/auth/get-perfil";
import { money } from "@/lib/estimaciones/motor-precio";
import { NOMBRE_TIPO_CUALQUIERA } from "@/lib/estimaciones/revision-db";
import {
  armarReporte,
  cargarRecibosPagados,
  etiquetaSemana,
  rangoSemana,
  semanaDePago,
  semanaPorReportar,
  semanasDelAnio,
  semanaVecina,
  type Semana,
} from "@/lib/estimaciones/reporte-semanal";

export const metadata = { title: "Reporte semanal" };

// Día-mes-año (ej. "14-09-2026").
function fechaNumerica(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}-${mes}-${anio}`;
}

function leerSemana(anio?: string, semana?: string): Semana {
  const a = Number(anio);
  const s = Number(semana);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return semanaPorReportar();
  if (!Number.isInteger(s) || s < 1 || s > semanasDelAnio(a)) return { anio: a, semana: 1 };
  return { anio: a, semana: s };
}

const consulta = (s: Semana) => `anio=${s.anio}&semana=${s.semana}`;
const hrefSemana = (s: Semana) => `/estimaciones/reportes?${consulta(s)}`;

// Reporte semanal de pagos (sustituye "Estimaciones SEM nn" y "FORMATO
// MAQUILA"): recibos PAGADOS de las tres áreas, un renglón por folio, por
// maquilador. La semana N junta lo pagado en la semana N+1. RLS limita la
// lectura al personal de Estimaciones; el maquilador no entra aquí.
export default async function ReporteSemanalPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; semana?: string }>;
}) {
  const supabase = await createClient();
  if (esMaquilador(await getPerfilActual(supabase))) {
    redirect("/estimaciones/mis-recibos");
  }

  const params = await searchParams;
  const semana = leerSemana(params.anio, params.semana);
  const trabajo = rangoSemana(semana);
  const pago = rangoSemana(semanaDePago(semana));
  const { recibos, error } = await cargarRecibosPagados(supabase, semana);
  const reporte = armarReporte(recibos);

  const anterior = semanaVecina(semana, -1);
  const siguiente = semanaVecina(semana, 1);
  const porReportar = semanaPorReportar();
  const totalSemanas = semanasDelAnio(semana.anio);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Reporte semanal · Semana {semana.semana} de {semana.anio}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Semana del {fechaNumerica(trabajo.desde)} al {fechaNumerica(trabajo.hasta)}. Recibos
            pagados del {fechaNumerica(pago.desde)} al {fechaNumerica(pago.hasta)} en Acabados,
            Armado y Electrificación.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {reporte.numRecibos > 0 && (
            <>
              <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {reporte.numRecibos} recibo{reporte.numRecibos === 1 ? "" : "s"}
              </span>
              <a
                href={`/api/estimaciones/reporte-semanal?${consulta(semana)}`}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Descargar Excel
              </a>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={hrefSemana(anterior)}
          className="rounded bg-white px-3 py-1 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          ← Semana {anterior.semana}
        </Link>
        <form action="/estimaciones/reportes" className="flex items-center gap-2">
          <select
            name="semana"
            defaultValue={semana.semana}
            className="rounded border border-slate-200 bg-white px-2 py-1"
            aria-label="Semana"
          >
            {Array.from({ length: totalSemanas }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Semana {n}
              </option>
            ))}
          </select>
          <input
            type="number"
            name="anio"
            defaultValue={semana.anio}
            min={2000}
            max={2100}
            className="w-24 rounded border border-slate-200 bg-white px-2 py-1"
            aria-label="Año"
          />
          <button
            type="submit"
            className="rounded bg-slate-900 px-3 py-1 font-semibold text-white hover:bg-slate-800"
          >
            Ver
          </button>
        </form>
        <Link
          href={hrefSemana(siguiente)}
          className="rounded bg-white px-3 py-1 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Semana {siguiente.semana} →
        </Link>
        {(semana.anio !== porReportar.anio || semana.semana !== porReportar.semana) && (
          <Link
            href={hrefSemana(porReportar)}
            className="px-2 font-medium text-indigo-600 hover:underline"
          >
            Semana por pagar ({porReportar.semana})
          </Link>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          No se pudieron leer los recibos: {error}
        </p>
      )}

      {!error && reporte.numRecibos === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          No hay recibos pagados para esta semana.
        </p>
      )}

      {reporte.numRecibos > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Maquilador</th>
                <th className="px-4 py-3">Área</th>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">OT</th>
                <th className="px-4 py-3 text-right">Importe</th>
                <th className="px-4 py-3 text-right">Seguro social</th>
                <th className="px-4 py-3 text-right">Total a pagar</th>
              </tr>
            </thead>
            {reporte.grupos.map((g) => (
              <tbody key={g.contratista} className="border-t border-slate-200">
                {g.filas.map((f, i) => (
                  <tr key={`${f.tipo}-${f.folio}`} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-900">
                      {i === 0 ? g.contratista : ""}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {NOMBRE_TIPO_CUALQUIERA[f.tipo]}
                      <span className="ml-1 text-xs text-slate-400">{f.subcuenta}</span>
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/estimaciones/recibos/${f.tipo}/recibo/${encodeURIComponent(f.folio)}`}
                        className="font-mono text-slate-700 hover:text-indigo-600 hover:underline"
                      >
                        EST-{f.folio}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-slate-700">{f.ot || "Sin OT"}</span>
                      {f.obra && <span className="ml-2 text-xs text-slate-500">{f.obra}</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700">
                      {money(f.importe)}
                    </td>
                    <td
                      className="px-4 py-2 text-right font-mono tabular-nums text-slate-400"
                      title={f.seguroSocial == null ? "Sin datos de IMSS todavía" : undefined}
                    >
                      {f.seguroSocial == null ? "—" : money(f.seguroSocial)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                      {money(f.totalPagar)}
                    </td>
                  </tr>
                ))}
                {g.filas.length > 1 && (
                  <tr className="bg-slate-50/60 text-xs">
                    <td colSpan={4} className="px-4 py-2 text-right text-slate-500">
                      Subtotal {g.contratista}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700">
                      {money(g.importe)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-500">
                      {g.seguroSocial == null ? "—" : money(g.seguroSocial)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums text-slate-900">
                      {money(g.totalPagar)}
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td colSpan={4} className="px-4 py-3 text-right text-slate-700">
                  Total {etiquetaSemana(semana).toLowerCase()}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                  {money(reporte.importe)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                  {money(reporte.seguroSocial)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                  {money(reporte.totalPagar)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Seguro social: todavía no hay datos de IMSS en el ERP, así que no se descuenta y el total a
        pagar es igual al importe. Cuando existan, se cargará por contratista al folio de mayor
        importe.
      </p>
    </main>
  );
}
