import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listarRecibos } from "@/lib/estimaciones/recibos-db";
import { money, fechaCorta } from "@/lib/estimaciones/motor-precio";

// Registro de recibos: todos los recibos de Acabados guardados, ordenados
// por folio de menor a mayor (numéricos primero, en orden; los que llevan
// letras o guiones van después). RLS ya filtra por is_estimaciones(), así
// que quien no tiene acceso al área simplemente ve la lista vacía.
export default async function RegistroRecibosPage() {
  const supabase = await createClient();
  const recibos = await listarRecibos(supabase);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Registro de recibos
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Recibos de maquila de Acabados, ordenados por folio.
          </p>
        </div>
        {recibos.length > 0 && (
          <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {recibos.length} recibo{recibos.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {recibos.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no hay recibos guardados.
        </p>
      )}

      {recibos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Contratista</th>
                <th className="px-4 py-3">Obra</th>
                <th className="px-4 py-3">OT</th>
                <th className="px-4 py-3">Prioridad</th>
                <th className="px-4 py-3 text-right">Renglones</th>
                <th className="px-4 py-3 text-right">Propuesto</th>
                <th className="px-4 py-3 text-right">Aceptado</th>
                <th className="px-4 py-3 text-right">Recorte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recibos.map((r) => {
                const recorte = r.totalPropuesto - r.totalAceptado;
                const recortePct = r.totalPropuesto > 0 ? (recorte / r.totalPropuesto) * 100 : 0;
                return (
                  <tr key={r.folio} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/estimaciones/recibos/acabados/recibo/${encodeURIComponent(r.folio)}`}
                        className="font-mono font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                      >
                        {r.folio}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{fechaCorta(r.fecha)}</td>
                    <td className="px-4 py-3 text-slate-700">{r.contratista || "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{r.obra || "—"}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{r.ot || "—"}</td>
                    <td className="px-4 py-3">
                      {r.prioridad === "normal" ? (
                        <span className="text-slate-400">Normal</span>
                      ) : (
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium capitalize text-amber-700 ring-1 ring-amber-200">
                          {r.prioridad}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {r.numRenglones}
                      {r.numPendientes > 0 && (
                        <span
                          title="Renglones pendientes de revisión"
                          className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200"
                        >
                          {r.numPendientes} pend.
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {money(r.totalPropuesto)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {money(r.totalAceptado)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                      {recorte > 0 ? `${money(recorte)} (${recortePct.toFixed(0)}%)` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
