"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { claveModelo, claveOt } from "@/lib/estimaciones/conciliacion-pm";
import {
  listarModelosOtRecibo,
  listarOtsRecibos,
  type ModeloOtRecibo,
  type OtRecibo,
} from "@/lib/estimaciones/pm-planeacion";

// OT y modelos de Planeación para los generadores de Acabados y Armado
// (Electrificación tiene su propia versión, solo con muebles con iluminación).
// Se elige la OT; los modelos son los de todos sus PM, con la cantidad sumada.

export interface OtSeleccion {
  // undefined: cargando; null: la consulta falló.
  ots: OtRecibo[] | null | undefined;
  // OT elegida, si la del recibo está en la lista. Un recibo anterior que
  // guardó el número de PM ("2PM193-24") cae en su OT ("193-24").
  otElegida: OtRecibo | null;
  // Modelos de la OT elegida; null mientras no hay OT o si la consulta falla.
  modelos: ModeloOtRecibo[] | null;
  // Vuelve a leer lo ya registrado por modelo (tras guardar, o si la base
  // avisó que cambió mientras se capturaba).
  recargar: () => void;
}

// excluirReciboId: al modificar un recibo, sus propias piezas no cuentan como
// "ya registradas" (se van a reemplazar).
export function useOtRecibo(
  ot: string,
  tipo: "acabados" | "armado",
  excluirReciboId?: string
): OtSeleccion {
  const [ots, setOts] = useState<OtRecibo[] | null | undefined>(undefined);
  useEffect(() => {
    listarOtsRecibos(createClient()).then(setOts);
  }, []);
  const otElegida = useMemo(() => {
    const clave = claveOt(ot);
    return (clave && ots?.find((o) => o.ot === clave)) || null;
  }, [ots, ot]);

  const [modelosDe, setModelosDe] = useState<{
    ot: string;
    modelos: ModeloOtRecibo[] | null;
  } | null>(null);
  const [version, setVersion] = useState(0);
  const claveElegida = otElegida?.ot ?? null;
  useEffect(() => {
    if (!claveElegida) return;
    let vigente = true;
    listarModelosOtRecibo(createClient(), claveElegida, tipo, excluirReciboId).then((modelos) => {
      if (vigente) setModelosDe({ ot: claveElegida, modelos });
    });
    return () => {
      vigente = false;
    };
  }, [claveElegida, tipo, excluirReciboId, version]);
  const modelos = modelosDe && modelosDe.ot === claveElegida ? modelosDe.modelos : null;

  return { ots, otElegida, modelos, recargar: () => setVersion((v) => v + 1) };
}

// Lista de OT de Planeación. Una OT capturada antes que ya no esté en la lista
// se conserva como opción para no perderla al editar.
export function SelectorOt({
  ot,
  seleccion,
  onChange,
  className,
}: {
  ot: string;
  seleccion: OtSeleccion;
  onChange: (ot: string, elegida: OtRecibo | null) => void;
  className: string;
}) {
  const { ots, otElegida } = seleccion;
  return (
    <select
      className={`${className} font-mono`}
      value={otElegida?.ot ?? ot}
      onChange={(e) => onChange(e.target.value, ots?.find((o) => o.ot === e.target.value) ?? null)}
    >
      <option value="">
        {ots === undefined
          ? "Cargando OT…"
          : ots === null
            ? "No se pudo cargar la lista de OT"
            : "Elige la OT"}
      </option>
      {ot && !otElegida && <option value={ot}>{ot} (no está en Planeación)</option>}
      {(ots ?? []).map((o) => (
        <option key={o.ot} value={o.ot}>
          {o.ot}
          {o.proyecto ? ` — ${o.proyecto}` : ""}
          {o.numPms > 1 ? ` (${o.numPms} PM)` : ""}
        </option>
      ))}
    </select>
  );
}

// Campo de modelo con la lista de modelos de la OT elegida (todos sus PM): se
// abre al enfocarlo y filtra mientras se escribe. Se puede escribir un modelo
// que no esté en la lista.
export function CampoModeloOt({
  value,
  onChange,
  onBlur,
  seleccion,
  className,
}: {
  value: string;
  onChange: (modelo: string) => void;
  onBlur?: () => void;
  seleccion: OtSeleccion;
  className: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const q = claveModelo(value);
  const opciones = (seleccion.modelos ?? [])
    .filter((m) => !q || claveModelo(m.modelo).includes(q))
    .slice(0, 60);
  const variosPm = (seleccion.otElegida?.numPms ?? 0) > 1;

  return (
    <div className="relative">
      <input
        autoComplete="off"
        placeholder={seleccion.otElegida ? "Elige o escribe el modelo" : "Elige primero la OT"}
        className={`${className} font-mono`}
        value={value}
        onFocus={() => setAbierto(true)}
        onBlur={() => {
          setAbierto(false);
          onBlur?.();
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
        }}
      />
      {abierto && opciones.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full min-w-64 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {opciones.map((m) => (
            <li key={m.modelo}>
              <button
                type="button"
                // mouseDown (no click): se dispara antes del blur del input.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(m.modelo);
                  setAbierto(false);
                }}
                className="flex w-full flex-col px-2.5 py-1.5 text-left text-sm hover:bg-indigo-50"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-slate-900">{m.modelo}</span>
                  <span className="whitespace-nowrap text-[11px] tabular-nums text-slate-500">
                    {m.cantidadPm} en la OT
                    {m.cantidadRegistrada > 0 && (
                      <>
                        {" · "}
                        <span
                          className={
                            m.cantidadRegistrada >= m.cantidadPm ? "font-semibold text-amber-700" : ""
                          }
                        >
                          {m.cantidadRegistrada} ya cobradas
                        </span>
                      </>
                    )}
                  </span>
                </span>
                {m.descripcion && (
                  <span className="truncate text-[11px] text-slate-500">{m.descripcion}</span>
                )}
                {variosPm && m.pms && (
                  <span className="truncate font-mono text-[10px] text-slate-400">{m.pms}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
