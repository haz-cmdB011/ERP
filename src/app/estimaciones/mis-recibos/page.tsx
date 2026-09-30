import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual, puedeCapturarTipo } from "@/lib/auth/get-perfil";
import { listarTodosLosRecibos } from "@/lib/estimaciones/listado-recibos";
import {
  agruparPorRecibo,
  contarRechazadas,
  listarResumenDiscrepancias,
} from "@/lib/estimaciones/discrepancias-resumen";
import { NOMBRE_TIPO_CUALQUIERA } from "@/lib/estimaciones/revision-db";
import { money, fechaCorta } from "@/lib/estimaciones/motor-precio";
import EstadoReciboBadge from "../estado-recibo-badge";
import CancelarReciboBoton from "../cancelar-recibo-boton";

// Mis recibos (solo maquiladores): RLS ya limita la lista a los que él
// capturó. Ve su propuesto, el estado y — una vez revisado — lo que se le
// aceptó, nunca el precio sugerido. Mientras nadie haya revisado ningún
// renglón puede cancelar el recibo para corregirlo y capturarlo de nuevo.
export default async function MisRecibosPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!esMaquilador(perfil)) {
    redirect("/estimaciones/registro");
  }

  const recibos = await listarTodosLosRecibos(supabase);
  // Cantidades que no concuerdan con el PM: pendientes de decisión y rechazadas.
  const resumen = await listarResumenDiscrepancias(supabase);
  const discrepanciasPorRecibo = agruparPorRecibo(resumen);
  const rechazos = contarRechazadas(resumen);
  const foliosRechazados = recibos
    .filter((r) => (discrepanciasPorRecibo.get(r.id)?.rechazadas ?? 0) > 0 && r.estado !== "cancelado")
    .map((r) => r.folio);
  const porCobrar = recibos
    .filter((r) => r.estado === "revisado")
    .reduce((s, r) => s + r.totalAceptado, 0);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Mis recibos</h1>
          <p className="mt-1 text-sm text-slate-500">
            {perfil?.contratista} · Se pagan una vez que Estimaciones revisa cada precio.
          </p>
        </div>
        {porCobrar > 0 && (
          <span className="rounded bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
            Revisado por pagar: {money(porCobrar)}
          </span>
        )}
      </div>

      {rechazos > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
        >
          <strong>
            {rechazos === 1
              ? "El administrador no aceptó un motivo de descuadre"
              : `El administrador no aceptó ${rechazos} motivos de descuadre`}
          </strong>{" "}
          en {foliosRechazados.length === 1 ? "el recibo" : "los recibos"}{" "}
          <span className="font-mono font-medium">{foliosRechazados.join(", ")}</span>. Abre el
          recibo para ver la respuesta; puedes modificarlo o cancelarlo.
        </div>
      )}

      {recibos.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no has capturado recibos.{" "}
          <Link href="/estimaciones/recibos" className="font-medium text-indigo-600 hover:underline">
            Capturar uno
          </Link>
        </p>
      )}

      {recibos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Obra</th>
                <th className="px-4 py-3">OT</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Renglones</th>
                <th className="px-4 py-3 text-right">Propuesto</th>
                <th className="px-4 py-3 text-right">Aceptado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recibos.map((r) => {
                const sinRevisar = r.numPendientes === r.numRenglones;
                return (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/estimaciones/recibos/${r.tipo}/recibo/${encodeURIComponent(r.folio)}`}
                        className="font-mono font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                      >
                        {r.folio}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{NOMBRE_TIPO_CUALQUIERA[r.tipo]}</td>
                    <td className="px-4 py-3 text-slate-700">{fechaCorta(r.fecha)}</td>
                    <td className="px-4 py-3 text-slate-700">{r.obra || "—"}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{r.ot || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <EstadoReciboBadge estado={r.estado} />
                        {(discrepanciasPorRecibo.get(r.id)?.rechazadas ?? 0) > 0 &&
                          r.estado !== "cancelado" && (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
                              Motivo no aceptado
                            </span>
                          )}
                        {(discrepanciasPorRecibo.get(r.id)?.pendientes ?? 0) > 0 &&
                          r.estado !== "cancelado" && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                              Descuadre en revisión
                            </span>
                          )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {r.numRenglones}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {money(r.totalPropuesto)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {r.estado === "revisado" || r.estado === "pagado"
                        ? money(r.totalAceptado)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.estado === "pendiente" && sinRevisar && (
                        <div className="flex flex-col items-end gap-1">
                          <CancelarReciboBoton tipo={r.tipo} reciboId={r.id} folio={r.folio} />
                          {puedeCapturarTipo(perfil, r.tipo) && (
                            <Link
                              href={`/estimaciones/mis-recibos/${r.tipo}/${encodeURIComponent(r.folio)}/modificar`}
                              className="text-xs font-medium text-slate-500 hover:text-indigo-600"
                            >
                              Modificar
                            </Link>
                          )}
                        </div>
                      )}
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
