"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizar } from "@/lib/estimaciones/motor-precio";
import {
  listarModelosPmRecibo,
  listarPmRecibos,
  type ModeloPmRecibo,
  type PmRecibo,
} from "@/lib/estimaciones/pm-planeacion";

// OT/PM y modelos de Planeación para los generadores de Acabados y Armado
// (Electrificación tiene su propia versión, con la marca de iluminación).

export interface PmSeleccion {
  // undefined: cargando; null: la consulta falló.
  pms: PmRecibo[] | null | undefined;
  // PM elegido, si la OT capturada está en la lista.
  pm: PmRecibo | null;
  // Modelos del PM elegido; null mientras no hay PM o si la consulta falla.
  modelos: ModeloPmRecibo[] | null;
}

export function usePmRecibo(ot: string): PmSeleccion {
  const [pms, setPms] = useState<PmRecibo[] | null | undefined>(undefined);
  useEffect(() => {
    listarPmRecibos(createClient()).then(setPms);
  }, []);
  const pm = useMemo(() => pms?.find((p) => p.numeroPedido === ot.trim()) ?? null, [pms, ot]);

  const [modelosDe, setModelosDe] = useState<{
    pedidoId: string;
    modelos: ModeloPmRecibo[] | null;
  } | null>(null);
  const pedidoId = pm?.pedidoId ?? null;
  useEffect(() => {
    if (!pedidoId) return;
    let vigente = true;
    listarModelosPmRecibo(createClient(), pedidoId).then((modelos) => {
      if (vigente) setModelosDe({ pedidoId, modelos });
    });
    return () => {
      vigente = false;
    };
  }, [pedidoId]);
  const modelos = modelosDe && modelosDe.pedidoId === pedidoId ? modelosDe.modelos : null;

  return { pms, pm, modelos };
}

// Lista de OT/PM de Planeación. Una OT capturada antes que ya no esté en la
// lista se conserva como opción para no perderla al editar.
export function SelectorOtPm({
  ot,
  seleccion,
  onChange,
  className,
}: {
  ot: string;
  seleccion: PmSeleccion;
  onChange: (ot: string, pm: PmRecibo | null) => void;
  className: string;
}) {
  const { pms, pm } = seleccion;
  return (
    <select
      className={`${className} font-mono`}
      value={ot}
      onChange={(e) =>
        onChange(e.target.value, pms?.find((p) => p.numeroPedido === e.target.value) ?? null)
      }
    >
      <option value="">
        {pms === undefined
          ? "Cargando OT del PM…"
          : pms === null
            ? "No se pudo cargar la lista de OT"
            : "Elige la OT"}
      </option>
      {ot && !pm && <option value={ot}>{ot} (no está en el PM)</option>}
      {(pms ?? []).map((p) => (
        <option key={p.pedidoId} value={p.numeroPedido}>
          {p.numeroPedido}
          {p.proyecto ? ` — ${p.proyecto}` : ""}
        </option>
      ))}
    </select>
  );
}

// Campo de modelo con la lista de modelos del PM elegido: se abre al
// enfocarlo y filtra mientras se escribe. Se puede escribir un modelo que no
// esté en la lista.
export function CampoModeloPm({
  value,
  onChange,
  onBlur,
  seleccion,
  className,
}: {
  value: string;
  onChange: (modelo: string) => void;
  onBlur?: () => void;
  seleccion: PmSeleccion;
  className: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const q = normalizar(value);
  const opciones = (seleccion.modelos ?? [])
    .filter((m) => !q || normalizar(m.modelo).includes(q))
    .slice(0, 60);

  return (
    <div className="relative">
      <input
        autoComplete="off"
        placeholder={seleccion.pm ? "Elige o escribe el modelo" : "Elige primero la OT"}
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
                    {m.cantidadPm} en el PM
                  </span>
                </span>
                {m.descripcion && (
                  <span className="truncate text-[11px] text-slate-500">{m.descripcion}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
