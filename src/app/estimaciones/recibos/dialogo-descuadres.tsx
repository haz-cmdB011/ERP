"use client";

import type { EstadoConciliacion } from "@/lib/estimaciones/conciliacion-pm";

export interface Descuadre {
  id: number;
  // Número de renglón como se ve en el recibo.
  num: number;
  modelo: string;
  conciliacion: EstadoConciliacion;
  // Lo ya registrado del modelo en otros recibos del área.
  registrada: number;
  motivo: string;
  // Un reproceso se compara con el retrabajo que reasignó Producción, no con el PM.
  reproceso?: boolean;
}

// Un renglón normal que no concuerda con el PM (modelo que no está en la OT o
// cantidad acumulada mayor a la declarada) NO se guarda: el PM es el tope y, si
// está mal, Planeación lo corrige. Solo un reproceso que se pasa de lo que
// Producción reasignó como retrabajo se guarda con motivo, para que el
// administrador de Estimaciones lo acepte o rechace. Compartido por Acabados,
// Armado y Electrificación.
export default function DialogoDescuadres({
  descuadres,
  ot,
  detalleModelos = "",
  onMotivo,
  onCerrar,
  onConfirmar,
}: {
  descuadres: Descuadre[];
  ot: string;
  // Aclaración de qué modelos de la OT cuentan (ej. " con iluminación").
  detalleModelos?: string;
  onMotivo: (id: number, motivo: string) => void;
  onCerrar: () => void;
  onConfirmar: () => void;
}) {
  // Si hay algún renglón normal fuera del PM, no se puede guardar (y los motivos
  // de los reprocesos no sirven de nada hasta corregirlo).
  const hayBloqueo = descuadres.some((d) => !d.reproceso);
  const faltanMotivos = descuadres.some((d) => d.reproceso && !d.motivo.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-descuadre"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div>
          <h2 id="titulo-descuadre" className="text-base font-semibold text-slate-900">
            {hayBloqueo ? "No se puede guardar" : "⚠ Hay reprocesos que no concuerdan con el retrabajo"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {hayBloqueo
              ? "Supera el límite del PM."
              : "Explica el motivo de cada renglón. El recibo se guarda y el motivo se envía al administrador de Estimaciones, que lo aceptará o lo rechazará; mientras tanto el recibo no se puede pagar."}
          </p>
        </div>

        {descuadres.map((d) => (
          <div key={d.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">
              Renglón #{d.num} · <span className="font-mono">{d.modelo || "sin modelo"}</span>
              {d.reproceso ? " (reproceso)" : ""}
            </p>
            <p className="mt-0.5 text-xs text-amber-900">
              {d.reproceso && d.conciliacion.estado === "excede" ? (
                d.conciliacion.cantidadPm === 0 ? (
                  `Producción no reasignó este modelo como retrabajo en la OT ${ot}: un reproceso solo se cobra si Calidad lo rechazó y Producción lo volvió a asignar.`
                ) : (
                  <>
                    Producción reasignó <b>{d.conciliacion.cantidadPm} pz</b> como retrabajo; con este
                    reproceso van <b>{d.conciliacion.acumulada} pz</b>
                    {d.registrada > 0 ? ` (${d.registrada} ya cobradas en otros recibos)` : ""}, sobran{" "}
                    {d.conciliacion.excedente}.
                  </>
                )
              ) : d.conciliacion.estado === "sin_modelo_en_pm" ? (
                `Este modelo no está entre los modelos${detalleModelos} de la OT ${ot}.`
              ) : d.conciliacion.estado === "excede" ? (
                <>
                  Planeación declaró <b>{d.conciliacion.cantidadPm} pz</b> en la OT; con este renglón van{" "}
                  <b>{d.conciliacion.acumulada} pz</b>
                  {d.registrada > 0 ? ` (${d.registrada} ya registradas en otros recibos)` : ""} —{" "}
                  sobran {d.conciliacion.excedente}.
                </>
              ) : null}
            </p>
            {!hayBloqueo && d.reproceso && (
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Motivo
                </span>
                <textarea
                  rows={2}
                  placeholder="¿Por qué se pasa del retrabajo reasignado?"
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                  value={d.motivo}
                  onChange={(e) => onMotivo(d.id, e.target.value)}
                />
              </label>
            )}
          </div>
        ))}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Volver a revisar
          </button>
          {!hayBloqueo && (
            <button
              type="button"
              disabled={faltanMotivos}
              onClick={onConfirmar}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-400 disabled:opacity-50"
            >
              Enviar al administrador y guardar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// El guardado falló porque la base vio un descuadre que la pantalla no (lo
// registrado del modelo cambió mientras se capturaba, o dos recibos a la vez).
export function esErrorDeDescuadre(error: string): boolean {
  return error.includes("captura el motivo") || error.includes("supera el límite del PM");
}

export const AVISO_DESCUADRE_CAMBIO =
  "Lo ya registrado de un modelo cambió desde que abriste el formulario (otro recibo se guardó mientras capturabas). Vuelve a pulsar Guardar para revisar las piezas y capturar el motivo.";
