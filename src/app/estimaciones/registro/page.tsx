import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual } from "@/lib/auth/get-perfil";
import { ESTADO_NOMBRE } from "@/lib/estimaciones/recibos-db";
import {
  ESTADOS_FILTRO,
  esEstadoRecibo,
  listarTodosLosRecibos,
} from "@/lib/estimaciones/listado-recibos";
import { NOMBRE_TIPO_CUALQUIERA } from "@/lib/estimaciones/revision-db";
import { money, fechaCorta } from "@/lib/estimaciones/motor-precio";
import EstadoReciboBadge from "../estado-recibo-badge";
import CancelarReciboBoton from "../cancelar-recibo-boton";

// Registro de recibos: todos los recibos guardados (Acabados, Armado y
// Electrificación), ordenados por folio de menor a mayor (numéricos
// primero, en orden; los que llevan letras o guiones van después). Se
// filtra por estado (?estado=pendiente es la bandeja "Por revisar"). RLS ya
// filtra por is_estimaciones(), así que quien no tiene acceso al área
// simplemente ve la lista vacía; el maquilador tiene su propia vista.
export default async function RegistroRecibosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const supabase = await createClient();
  if (esMaquilador(await getPerfilActual(supabase))) {
    redirect("/estimaciones/mis-recibos");
  }

  const { estado } = await searchParams;
  const filtro = esEstadoRecibo(estado) ? estado : null;

  const todos = await listarTodosLosRecibos(supabase);
  // Sin filtro no se muestran los cancelados (quedan en su propio filtro).
  const recibos = todos.filter((r) => (filtro ? r.estado === filtro : r.estado !== "cancelado"));
  const conteo = Object.fromEntries(
    ESTADOS_FILTRO.map((e) => [e, todos.filter((r) => r.estado === e).length])
  );

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {filtro === "pendiente" ? "Por revisar" : "Registro de recibos"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {filtro === "pendiente"
              ? "Recibos con precios sin decidir. Al maquilador no se le paga hasta que el recibo queda revisado."
              : "Recibos de maquila (Acabados, Armado y Electrificación), ordenados por folio."}
          </p>
        </div>
        {recibos.length > 0 && (
          <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {recibos.length} recibo{recibos.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Filtro href="/estimaciones/registro" activo={!filtro} etiqueta="Vigentes" />
        {ESTADOS_FILTRO.map((e) => (
          <Filtro
            key={e}
            href={`/estimaciones/registro?estado=${e}`}
            activo={filtro === e}
            etiqueta={`${ESTADO_NOMBRE[e]} (${conteo[e]})`}
          />
        ))}
      </nav>

      {recibos.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          {filtro === "pendiente" ? "No hay recibos por revisar." : "No hay recibos en esta vista."}
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
                <th className="px-4 py-3">Contratista</th>
                <th className="px-4 py-3">Obra</th>
                <th className="px-4 py-3">OT</th>
                <th className="px-4 py-3">Prioridad</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Renglones</th>
                <th className="px-4 py-3 text-right">Propuesto</th>
                <th className="px-4 py-3 text-right">Aceptado</th>
                <th className="px-4 py-3 text-right">Recorte</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recibos.map((r) => {
                const recorte = r.totalPropuesto - r.totalAceptado;
                const recortePct = r.totalPropuesto > 0 ? (recorte / r.totalPropuesto) * 100 : 0;
                const folioUrl = encodeURIComponent(r.folio);
                return (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/estimaciones/recibos/${r.tipo}/recibo/${folioUrl}`}
                        className="font-mono font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                      >
                        {r.folio}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{NOMBRE_TIPO_CUALQUIERA[r.tipo]}</td>
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
                    <td className="px-4 py-3">
                      <EstadoReciboBadge estado={r.estado} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {r.numRenglones}
                      {r.numPendientes > 0 && r.estado === "pendiente" && (
                        <span
                          title="Renglones sin revisar"
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
                      {r.estado === "pendiente" ? "—" : money(r.totalAceptado)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                      {r.estado !== "pendiente" && recorte > 0
                        ? `${money(recorte)} (${recortePct.toFixed(0)}%)`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {(r.estado === "pendiente" || r.estado === "revisado") && (
                          <Link
                            href={`/estimaciones/revision/${r.tipo}/${folioUrl}`}
                            className="whitespace-nowrap rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            {r.estado === "pendiente" ? "Revisar" : "Pagar"}
                          </Link>
                        )}
                        {r.estado === "pendiente" && (
                          <CancelarReciboBoton tipo={r.tipo} reciboId={r.id} folio={r.folio} />
                        )}
                      </div>
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

function Filtro({ href, activo, etiqueta }: { href: string; activo: boolean; etiqueta: string }) {
  return (
    <Link
      href={href}
      className={`rounded px-3 py-1 font-medium ring-1 ${
        activo
          ? "bg-slate-900 text-white ring-slate-900"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {etiqueta}
    </Link>
  );
}
