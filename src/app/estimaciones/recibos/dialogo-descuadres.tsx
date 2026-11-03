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
}

// Un recibo no se guarda con renglones que no concuerdan con el PM (modelo que
// no está en la OT o cantidad acumulada mayor a la declarada): el PM es el tope
// y, si está mal, Planeación lo corrige. Compartido por Acabados, Armado y
// Electrificación.
export default function DialogoDescuadres({
  descuadres,
  ot,
  detalleModelos = "",
  onCerrar,
}: {
  descuadres: Descuadre[];
  ot: string;
  // Aclaración de qué modelos de la OT cuentan (ej. " con iluminación").
  detalleModelos?: string;
  onCerrar: () => void;
}) {
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
            No se puede guardar: hay piezas de más
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            No se puede cobrar más que lo que declaró Planeación en el PM. Corrige las cantidades; si el PM
            está mal, pide a Planeación que lo corrija.
          </p>
        </div>

        {descuadres.map((d) => (
          <div key={d.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">
              Renglón #{d.num} · <span className="font-mono">{d.modelo || "sin modelo"}</span>
            </p>
            <p className="mt-0.5 text-xs text-amber-900">
              {d.conciliacion.estado === "sin_modelo_en_pm" ? (
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
          </div>
        ))}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-400"
          >
            Volver a revisar
          </button>
        </div>
      </div>
    </div>
  );
}

// El guardado falló porque la base vio un descuadre que la pantalla no (lo
// registrado del modelo cambió mientras se capturaba, o dos recibos a la vez).
export function esErrorDeDescuadre(error: string): boolean {
  return error.includes("no se puede cobrar más que el PM");
}

export const AVISO_DESCUADRE_CAMBIO =
  "Lo ya registrado de un modelo cambió desde que abriste el formulario (otro recibo se guardó mientras capturabas). Vuelve a pulsar Guardar para revisar las piezas.";
