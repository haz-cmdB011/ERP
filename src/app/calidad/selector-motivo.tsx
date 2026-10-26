"use client";

import { useState } from "react";
import { filtrarMotivos } from "@/lib/calidad/motivos";
import { TIPO_PROBLEMA_LABELS, type MotivoCalidad } from "@/lib/calidad/no-conformidad";

// Lista para elegir un motivo del catálogo con el dedo: buscador arriba, los más
// usados como botones y filas altas (48 px) que se tocan sin errar.
export default function SelectorMotivo({
  motivos,
  masUsados,
  onElegir,
}: {
  motivos: MotivoCalidad[];
  masUsados: MotivoCalidad[];
  onElegir: (m: MotivoCalidad) => void;
}) {
  const [texto, setTexto] = useState("");
  const { lista, hayMas } = filtrarMotivos(motivos, texto);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar: código o palabra (armado, cristal, dimensión…)"
        aria-label="Buscar motivo"
        className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-slate-400 focus:outline-none"
      />

      {!texto.trim() && masUsados.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Más usados</p>
          <div className="flex flex-wrap gap-2">
            {masUsados.map((m) => (
              <button
                key={m.codigo}
                type="button"
                onClick={() => onElegir(m)}
                className="min-h-11 rounded-full border border-brand-300 bg-brand-50 px-3 text-left text-sm font-medium text-brand-800 active:bg-brand-100"
              >
                {m.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
        {lista.map((m) => (
          <li key={m.codigo}>
            <button
              type="button"
              onClick={() => onElegir(m)}
              className="flex min-h-12 w-full items-center gap-3 bg-white px-3 py-2 text-left active:bg-slate-100"
            >
              <span className="w-10 shrink-0 text-xs tabular-nums text-slate-500">{m.codigo}</span>
              <span className="flex-1 text-sm font-medium text-slate-900">{m.nombre}</span>
              <span className="shrink-0 rounded-full border border-slate-300 px-2 py-0.5 text-xs uppercase text-slate-600">
                {TIPO_PROBLEMA_LABELS[m.tipo]}
              </span>
            </button>
          </li>
        ))}
        {lista.length === 0 && <li className="px-3 py-4 text-sm text-slate-500">Ningún motivo coincide con “{texto}”.</li>}
      </ul>
      {hayMas && <p className="text-xs text-slate-500">Hay más resultados: escribe más letras para acotar.</p>}
    </div>
  );
}
