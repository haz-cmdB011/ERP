"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import ConfirmDialog from "@/components/confirm-dialog";
import { money } from "@/lib/estimaciones/motor-precio";
import { cerrarSemana, reabrirSemana, type CierreSemana as DatosCierre } from "@/lib/estimaciones/reporte-cierres-db";
import type { DiferenciaCierre, InstantaneaSemana } from "@/lib/estimaciones/reporte-control";
import type { Semana } from "@/lib/estimaciones/reporte-semanal";
import { formatoFechaHora } from "@/lib/resumen/entrega";
import { ETIQUETA_AREA } from "@/lib/estimaciones/reporte-dashboard";

// Cerrar la semana guarda una copia de lo reportado; si después cambia (se
// elimina o corrige un recibo pagado), la pantalla lo señala con el detalle.
export default function CierreSemana({
  semana,
  actual,
  cierre,
  diferencia,
  puedeCerrar,
}: {
  semana: Semana;
  actual: InstantaneaSemana;
  cierre: DatosCierre | null;
  diferencia: DiferenciaCierre | null;
  puedeCerrar: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<"cerrar" | "reabrir" | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar() {
    const accion = confirmando;
    if (!accion) return;
    setTrabajando(true);
    setError(null);
    const supabase = createClient();
    const { error } =
      accion === "cerrar"
        ? await cerrarSemana(supabase, semana, actual)
        : await reabrirSemana(supabase, semana);
    setTrabajando(false);
    setConfirmando(null);
    if (error) {
      setError(error);
      return;
    }
    avisar(accion === "cerrar" ? `Semana ${semana.semana} cerrada.` : `Semana ${semana.semana} reabierta.`);
    router.refresh();
  }

  const cambios = cierre && diferencia && !diferencia.sinCambios;

  return (
    <section
      className={`rounded-xl border p-4 ${
        cambios ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
      aria-label="Cierre de la semana"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">
            {cierre ? "Semana cerrada" : "Semana abierta"}
          </h2>
          <p className="text-xs text-slate-600">
            {cierre
              ? `Se cerró el ${formatoFechaHora(cierre.cerradoEn)}${
                  cierre.cerradoPorCorreo ? ` por ${cierre.cerradoPorCorreo}` : ""
                } con ${cierre.numRecibos} recibo${cierre.numRecibos === 1 ? "" : "s"} por ${money(cierre.importe)}.`
              : "El reporte se recalcula en cada visita. Ciérralo cuando lo entregues para detectar cambios posteriores."}
          </p>
        </div>
        {puedeCerrar && (
          <button
            type="button"
            disabled={trabajando || (!cierre && actual.numRecibos === 0)}
            onClick={() => setConfirmando(cierre ? "reabrir" : "cerrar")}
            className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {cierre ? "Reabrir semana" : "Cerrar semana"}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}

      {cierre && diferencia?.sinCambios && (
        <p className="mt-2 text-xs font-medium text-emerald-700">
          El reporte actual coincide con lo cerrado.
        </p>
      )}

      {cambios && diferencia && (
        <div className="mt-3 flex flex-col gap-2 text-sm text-amber-900">
          <p className="font-semibold">
            El reporte cambió desde que se cerró: {diferencia.difImporte >= 0 ? "+" : "−"}
            {money(Math.abs(diferencia.difImporte))} y {diferencia.difRecibos >= 0 ? "+" : "−"}
            {Math.abs(diferencia.difRecibos)} recibo{Math.abs(diferencia.difRecibos) === 1 ? "" : "s"}.
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {diferencia.faltantes.map((r) => (
              <li key={`f-${r.tipo}-${r.folio}`}>
                Ya no aparece: {ETIQUETA_AREA[r.tipo]} {r.folio} · {r.contratista} · {money(r.importe)}
              </li>
            ))}
            {diferencia.agregados.map((r) => (
              <li key={`a-${r.tipo}-${r.folio}`}>
                Nuevo: {ETIQUETA_AREA[r.tipo]} {r.folio} · {r.contratista} · {money(r.importe)}
              </li>
            ))}
            {diferencia.cambiados.map((c) => (
              <li key={`c-${c.recibo.tipo}-${c.recibo.folio}`}>
                Cambió el importe de {ETIQUETA_AREA[c.recibo.tipo]} {c.recibo.folio}:{" "}
                {money(c.importeCerrado)} → {money(c.recibo.importe)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={confirmando !== null}
        title={confirmando === "reabrir" ? `Reabrir la semana ${semana.semana}` : `Cerrar la semana ${semana.semana}`}
        message={
          confirmando === "reabrir"
            ? "Se borra la copia guardada. Después podrás cerrarla de nuevo con los datos de hoy."
            : `Se guarda una copia de ${actual.numRecibos} recibo${actual.numRecibos === 1 ? "" : "s"} por ${money(actual.importe)}. Podrás reabrirla si hace falta.`
        }
        confirmLabel={confirmando === "reabrir" ? "Reabrir" : "Cerrar semana"}
        cancelLabel="Volver"
        destructive={confirmando === "reabrir"}
        busy={trabajando}
        onConfirm={() => void ejecutar()}
        onCancel={() => setConfirmando(null)}
      />
    </section>
  );
}
