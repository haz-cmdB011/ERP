"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConfirmDialog from "@/components/confirm-dialog";
import { avisar } from "@/components/avisos";
import { money } from "@/lib/estimaciones/motor-precio";
import { formatoFechaDMA } from "@/lib/resumen/entrega";
import { marcarReciboPagado, NOMBRE_TIPO_CUALQUIERA } from "@/lib/estimaciones/revision-db";
import type { ReciboListado } from "@/lib/estimaciones/listado-recibos";
import EstadoReciboBadge from "../estado-recibo-badge";
import CancelarReciboBoton from "../cancelar-recibo-boton";
import EliminarReciboDefinitivoBoton from "../eliminar-recibo-definitivo-boton";

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

function PuntoPrioridad({ prioridad }: { prioridad: string }) {
  return (
    <span
      title={PRIORIDAD_NOMBRE[prioridad] ?? prioridad}
      className={`inline-block h-3 w-3 shrink-0 rounded-full ${PRIORIDAD_COLOR[prioridad] ?? "bg-slate-300"}`}
    />
  );
}

// Registro de recibos: tabla en pantallas anchas y tarjetas en el celular. Los
// recibos "Revisados" se pueden marcar y pagar de una vez.
export default function TablaRegistro({
  recibos,
  esDesarrollador,
}: {
  recibos: ReciboListado[];
  esDesarrollador: boolean;
}) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [fallos, setFallos] = useState<string[]>([]);
  const [pagados, setPagados] = useState(0);

  const pagables = recibos.filter((r) => r.estado === "revisado");
  const elegidos = pagables.filter((r) => marcados.has(r.id));
  const totalElegido = elegidos.reduce((s, r) => s + r.totalAceptado, 0);
  const todosMarcados = pagables.length > 0 && elegidos.length === pagables.length;

  function alternar(id: string) {
    setMarcados((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id);
      else sig.add(id);
      return sig;
    });
  }

  function alternarTodos() {
    setMarcados(todosMarcados ? new Set() : new Set(pagables.map((r) => r.id)));
  }

  async function pagarMarcados() {
    setPagando(true);
    setFallos([]);
    const supabase = createClient();
    let hechos = 0;
    const errores: string[] = [];
    const idsFallidos = new Set<string>();
    for (const r of elegidos) {
      const { error } = await marcarReciboPagado(supabase, r.tipo, r.id);
      if (error) {
        errores.push(`${r.folio} (${NOMBRE_TIPO_CUALQUIERA[r.tipo]}): ${error}`);
        idsFallidos.add(r.id);
      } else {
        hechos += 1;
      }
    }
    setPagando(false);
    setConfirmando(false);
    setFallos(errores);
    setPagados(hechos);
    // Lo pagado sale de la selección; lo que falló se queda marcado para reintentar.
    setMarcados(idsFallidos);
    if (hechos > 0) avisar(`${hechos} recibo${hechos === 1 ? "" : "s"} marcado${hechos === 1 ? "" : "s"} como pagado${hechos === 1 ? "" : "s"}.`);
    router.refresh();
  }

  const acciones = (r: ReciboListado) => {
    const folioUrl = encodeURIComponent(r.folio);
    return (
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
          <EliminarReciboDefinitivoBoton tipo={r.tipo} reciboId={r.id} folio={r.folio} variante="icono" />
        ) : (
          r.estado === "pendiente" && <CancelarReciboBoton tipo={r.tipo} reciboId={r.id} folio={r.folio} />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {pagados > 0 && fallos.length === 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span>
            Se pagaron {pagados} recibo{pagados === 1 ? "" : "s"}.
          </span>
          <Link href="/estimaciones/reportes" className="font-medium underline">
            Descargar el Excel para Finanzas en el reporte semanal →
          </Link>
        </div>
      )}
      {fallos.length > 0 && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <strong>
            {pagados > 0 ? `Se pagaron ${pagados}, pero ` : ""}
            {fallos.length} no se pudo{fallos.length === 1 ? "" : "ieron"} pagar:
          </strong>
          <ul className="mt-1 list-disc pl-5">
            {fallos.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {pagables.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white/95 px-4 py-2 text-sm shadow-sm backdrop-blur">
          <label className="flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} className="h-4 w-4 accent-emerald-700" />
            Marcar los {pagables.length} revisados de esta página
          </label>
          {elegidos.length > 0 && (
            <>
              <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                {elegidos.length} · {money(totalElegido)}
              </span>
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                disabled={pagando}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                Pagar {elegidos.length} recibo{elegidos.length === 1 ? "" : "s"}
              </button>
              <button type="button" onClick={() => setMarcados(new Set())} className="text-xs text-slate-500 hover:text-slate-900">
                Quitar selección
              </button>
            </>
          )}
        </div>
      )}

      {/* Tarjetas (celular) */}
      <ul className="flex flex-col gap-3 md:hidden">
        {recibos.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                {r.estado === "revisado" && (
                  <input
                    type="checkbox"
                    checked={marcados.has(r.id)}
                    onChange={() => alternar(r.id)}
                    aria-label={`Marcar el recibo ${r.folio} para pagar`}
                    className="h-5 w-5 accent-emerald-700"
                  />
                )}
                <Link
                  href={`/estimaciones/recibos/${r.tipo}/recibo/${encodeURIComponent(r.folio)}`}
                  className="font-mono text-base font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                >
                  {r.folio}
                </Link>
                <PuntoPrioridad prioridad={r.prioridad} />
              </div>
              <EstadoReciboBadge estado={r.estado} />
            </div>
            <p className="mt-2 text-sm text-slate-700">
              {NOMBRE_TIPO_CUALQUIERA[r.tipo]} · {r.contratista || "—"}
            </p>
            <p className="text-xs text-slate-500">
              {formatoFechaDMA(r.fecha)} · OT {r.ot || "—"}
            </p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="font-mono text-xs tabular-nums text-slate-600">
                <div>Propuesto {money(r.totalPropuesto)}</div>
                <div className="text-sm font-semibold text-slate-900">
                  Aceptado {r.estado === "pendiente" ? "—" : money(r.totalAceptado)}
                </div>
              </div>
              {acciones(r)}
            </div>
          </li>
        ))}
      </ul>

      {/* Tabla (pantallas anchas) */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-8 px-4 py-3" />
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
            {recibos.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-slate-50">
                <td className="px-4 py-3">
                  {r.estado === "revisado" && (
                    <input
                      type="checkbox"
                      checked={marcados.has(r.id)}
                      onChange={() => alternar(r.id)}
                      aria-label={`Marcar el recibo ${r.folio} para pagar`}
                      className="h-4 w-4 accent-emerald-700"
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/estimaciones/recibos/${r.tipo}/recibo/${encodeURIComponent(r.folio)}`}
                    className="font-mono font-medium text-slate-900 hover:text-brand-700 hover:underline"
                  >
                    {r.folio}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{NOMBRE_TIPO_CUALQUIERA[r.tipo]}</td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">{formatoFechaDMA(r.fecha)}</td>
                <td className="px-4 py-3 text-slate-700">{r.contratista || "—"}</td>
                <td className="px-4 py-3 font-mono text-slate-700">{r.ot || "—"}</td>
                <td className="px-4 py-3">
                  <PuntoPrioridad prioridad={r.prioridad} />
                </td>
                <td className="px-4 py-3">
                  <EstadoReciboBadge estado={r.estado} />
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">{money(r.totalPropuesto)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                  {r.estado === "pendiente" ? "—" : money(r.totalAceptado)}
                </td>
                <td className="px-4 py-3 text-right">{acciones(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmando}
        title={`Pagar ${elegidos.length} recibo${elegidos.length === 1 ? "" : "s"}`}
        message={`Se marcan como pagados por ${money(totalElegido)} y ya no se podrán modificar. Si alguno tiene diferencias con el PM sin decidir, ese no se paga y se te dice cuál.`}
        confirmLabel={pagando ? "Pagando…" : "Marcar como pagados"}
        busy={pagando}
        onConfirm={() => void pagarMarcados()}
        onCancel={() => setConfirmando(false)}
      />
    </div>
  );
}
