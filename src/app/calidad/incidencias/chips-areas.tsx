"use client";

import { useId, useState } from "react";
import { listaDeAreas } from "@/lib/calidad/incidencias";
import { estiloCampo, estiloEtiqueta } from "@/app/produccion/asignaciones/modal";

// Varias áreas en un campo: se escribe o se elige una sugerida y se agrega con
// Enter o con el botón; cada una queda como una etiqueta que se quita con ×.
export default function ChipsAreas({
  etiqueta,
  valores,
  onCambio,
  sugerencias,
}: {
  etiqueta: string;
  valores: string[];
  onCambio: (nuevos: string[]) => void;
  sugerencias: string[];
}) {
  const idLista = useId();
  const [texto, setTexto] = useState("");

  function agregar() {
    const nuevas = listaDeAreas(texto).filter((a) => !valores.includes(a));
    if (nuevas.length > 0) onCambio([...valores, ...nuevas]);
    setTexto("");
  }

  return (
    <div className={estiloEtiqueta}>
      <label htmlFor={`${idLista}-campo`}>{etiqueta}</label>
      {valores.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {valores.map((v) => (
            <li
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-slate-700"
            >
              {v}
              <button
                type="button"
                onClick={() => onCambio(valores.filter((x) => x !== v))}
                aria-label={`Quitar ${v}`}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={`${idLista}-campo`}
          list={idLista}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregar();
            }
          }}
          placeholder="Elige o escribe un área"
          autoComplete="off"
          className={estiloCampo}
        />
        <button
          type="button"
          onClick={agregar}
          className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
        >
          Agregar
        </button>
      </div>
      <datalist id={idLista}>
        {sugerencias
          .filter((s) => !valores.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
