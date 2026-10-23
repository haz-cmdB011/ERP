import Link from "next/link";
import { SIN_AUDITOR, type ConteoAuditor } from "@/lib/calidad/incidencias";

function pct(parte: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((parte / total) * 100)}%`;
}

// Quién auditó los reportes del periodo: cuántos y cuántos siguen abiertos. Tocar un nombre filtra el tablero por esa persona.
export default function TablaAuditores({
  auditores,
  hrefDe,
}: {
  auditores: ConteoAuditor[];
  hrefDe: (nombre: string) => string;
}) {
  const total = auditores.reduce((n, a) => n + a.total, 0);
  const abiertas = auditores.reduce((n, a) => n + a.abiertas, 0);
  const cerradas = auditores.reduce((n, a) => n + a.cerradas, 0);
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Quién auditó</h2>
        <p className="text-xs text-slate-500">Reportes del periodo por auditor y cómo van.</p>
      </div>
      {auditores.length === 0 ? (
        <p className="text-sm text-slate-500">Sin reportes en este periodo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-semibold">Auditó</th>
                <th className="py-2 pr-3 text-right font-semibold">Reportes</th>
                <th className="py-2 pr-3 text-right font-semibold">Abiertos</th>
                <th className="py-2 pr-3 text-right font-semibold">Cerrados</th>
                <th className="py-2 text-right font-semibold">% cerrado</th>
              </tr>
            </thead>
            <tbody>
              {auditores.map((a) => (
                <tr key={a.nombre} className="border-t border-slate-100">
                  <td className="py-2 pr-3 text-slate-700">
                    <Link href={hrefDe(a.nombre)} className="hover:underline">
                      {a.nombre}
                    </Link>
                    {a.nombre === SIN_AUDITOR && <span className="ml-1 text-xs text-slate-500">(no consta)</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-900">{a.total}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-amber-700">{a.abiertas}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-emerald-700">{a.cerradas}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{pct(a.cerradas, a.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-medium text-slate-900">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pr-3 text-right tabular-nums">{total}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-amber-700">{abiertas}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-emerald-700">{cerradas}</td>
                <td className="py-2 text-right tabular-nums">{pct(cerradas, total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
