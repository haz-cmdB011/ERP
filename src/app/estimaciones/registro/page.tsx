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
import { money } from "@/lib/estimaciones/motor-precio";
import EstadoReciboBadge from "../estado-recibo-badge";
import CancelarReciboBoton from "../cancelar-recibo-boton";
import EliminarReciboDefinitivoBoton from "../eliminar-recibo-definitivo-boton";

// Fecha numérica día-mes-año (ej. "31-08-2026"), solo para esta tabla.
function fechaNumerica(iso: string): string {
  const [anio, mes, dia] = String(iso).split("-");
  return `${dia}-${mes}-${anio}`;
}

const PRIORIDAD_COLOR: Record<string, string> = {
  urgente: "bg-red-500",
  preferente: "bg-amber-400",
  normal: "bg-emerald-500",
};

const PRIORIDAD_NOMBRE: Record<string, string> = {
  urgente: "Urgente",
  preferente: "Preferente",
  normal: "Normal",
};

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
  const perfil = await getPerfilActual(supabase);
  if (esMaquilador(perfil)) {
    redirect("/estimaciones/mis-recibos");
  }
  // Solo el desarrollador elimina recibos definitivamente (la base también lo exige).
  const esDesarrollador = perfil?.rol === "desarrollador";

  const { estado } = await searchParams;
  const filtro = esEstadoRecibo(estado) ? estado : null;

  const todos = await listarTodosLosRecibos(supabase);
  // Sin filtro no se muestran los cancelados (quedan en su propio filtro).
  const recibos = todos.filter((r) => (filtro ? r.estado === filtro : r.estado !== "cancelado"));
  const conteo = Object.fromEntries(
    ESTADOS_FILTRO.map((e) => [e, todos.filter((r) => r.estado === e).length])
  );

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
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
                <th className="px-4 py-3">OT</th>
                <th className="px-4 py-3">Prioridad</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Propuesto</th>
                <th className="px-4 py-3 text-right">Aceptado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recibos.map((r) => {
                const folioUrl = encodeURIComponent(r.folio);
                return (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/estimaciones/recibos/${r.tipo}/recibo/${folioUrl}`}
                        className="font-mono font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {r.folio}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{NOMBRE_TIPO_CUALQUIERA[r.tipo]}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{fechaNumerica(r.fecha)}</td>
                    <td className="px-4 py-3 text-slate-700">{r.contratista || "—"}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{r.ot || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        title={PRIORIDAD_NOMBRE[r.prioridad] ?? r.prioridad}
                        className={`inline-block h-3 w-3 rounded-full ${
                          PRIORIDAD_COLOR[r.prioridad] ?? "bg-slate-300"
                        }`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <EstadoReciboBadge estado={r.estado} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {money(r.totalPropuesto)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {r.estado === "pendiente" ? "—" : money(r.totalAceptado)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {(r.estado === "pendiente" || r.estado === "revisado") && (
                          <Link
                            href={`/estimaciones/revision/${r.tipo}/${folioUrl}`}
                            className="whitespace-nowrap rounded bg-brand-500 px-2.5 py-1 text-xs font-semibold text-on-brand hover:bg-brand-400"
                          >
                            {r.estado === "pendiente" ? "Revisar" : "Pagar"}
                          </Link>
                        )}
                        {esDesarrollador ? (
                          <EliminarReciboDefinitivoBoton
                            tipo={r.tipo}
                            reciboId={r.id}
                            folio={r.folio}
                            variante="icono"
                          />
                        ) : (
                          r.estado === "pendiente" && (
                            <CancelarReciboBoton tipo={r.tipo} reciboId={r.id} folio={r.folio} />
                          )
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
          ? "bg-brand-500 text-on-brand ring-brand-600"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {etiqueta}
    </Link>
  );
}
