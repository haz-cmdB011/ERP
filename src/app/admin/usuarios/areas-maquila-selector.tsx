"use client";

import { AREAS_MAQUILA, AREA_MAQUILA_LABELS, type AreaMaquila } from "@/lib/auth/roles";

// Área(s) de maquila del maquilador. Lo normal es marcar una sola; se
// permiten varias como excepción.
export default function AreasMaquilaSelector({
  valor,
  onChange,
  disabled = false,
}: {
  valor: AreaMaquila[];
  onChange: (areas: AreaMaquila[]) => void;
  disabled?: boolean;
}) {
  function alternar(area: AreaMaquila) {
    const siguiente = valor.includes(area) ? valor.filter((a) => a !== area) : [...valor, area];
    onChange(AREAS_MAQUILA.filter((a) => siguiente.includes(a)));
  }

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Área de maquila">
      {AREAS_MAQUILA.map((a) => {
        const activo = valor.includes(a);
        return (
          <label
            key={a}
            className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs ${
              activo
                ? "border-black bg-black text-white"
                : "border-gray-300 text-gray-600 hover:border-gray-500"
            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={activo}
              disabled={disabled}
              onChange={() => alternar(a)}
            />
            {AREA_MAQUILA_LABELS[a]}
          </label>
        );
      })}
    </div>
  );
}
