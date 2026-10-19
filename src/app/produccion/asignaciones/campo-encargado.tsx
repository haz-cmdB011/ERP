"use client";

import { useState } from "react";
import { estiloCampo, estiloEtiqueta } from "./modal";

const NUEVO = "__nuevo__";

// Encargado de las piezas que se asignan. Se elige entre los que ya se
// escribieron en el equipo (lista como la de Equipo) o se agrega uno nuevo; el
// nombre nuevo queda guardado en el equipo al asignar. Sin encargados guardados
// se escribe directo.
export default function CampoEncargado({
  valor,
  onCambio,
  sugerencias,
  disabled = false,
}: {
  valor: string;
  onCambio: (v: string) => void;
  sugerencias: string[];
  disabled?: boolean;
}) {
  const [escribiendo, setEscribiendo] = useState(false);
  const hayLista = sugerencias.length > 0;
  const modoTexto = !hayLista || escribiendo || (valor !== "" && !sugerencias.includes(valor));
  const seleccionado = sugerencias.includes(valor) ? valor : "";

  return (
    <div className="flex flex-col gap-3">
      {hayLista && (
        <label className={estiloEtiqueta}>
          Encargado de estas piezas
          <select
            value={modoTexto ? NUEVO : seleccionado}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value === NUEVO) {
                setEscribiendo(true);
                onCambio("");
              } else {
                setEscribiendo(false);
                onCambio(e.target.value);
              }
            }}
            className={estiloCampo}
          >
            <option value="">Sin encargado</option>
            {sugerencias.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={NUEVO}>+ Agregar otro encargado…</option>
          </select>
        </label>
      )}
      {modoTexto && (
        <label className={estiloEtiqueta}>
          {hayLista ? "Nombre del nuevo encargado" : "Encargado de estas piezas"}
          <input
            type="text"
            maxLength={80}
            value={valor}
            disabled={disabled}
            onChange={(e) => onCambio(e.target.value)}
            placeholder="Nombre del encargado"
            className={estiloCampo}
          />
        </label>
      )}
    </div>
  );
}
