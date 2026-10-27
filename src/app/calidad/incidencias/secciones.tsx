"use client";

import { useState, type ReactNode } from "react";

// Reparte las estadísticas en apartados cortos (Resumen, Auditores, Áreas...) para que no salgan
// todas juntas: solo se ve el apartado elegido. Cada apartado se pinta en el servidor y aquí solo
// se alterna cuál se muestra.
export default function Secciones({
  secciones,
}: {
  secciones: Array<{ id: string; titulo: string; contenido: ReactNode }>;
}) {
  const [activa, setActiva] = useState(secciones[0]?.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Apartados de estadísticas">
        {secciones.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={activa === s.id}
            onClick={() => setActiva(s.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors max-md:min-h-11 ${
              activa === s.id
                ? "border-brand-600 bg-brand-500 text-on-brand"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s.titulo}
          </button>
        ))}
      </div>
      {secciones.map((s) => (
        <div key={s.id} hidden={activa !== s.id} className="flex flex-col gap-6">
          {s.contenido}
        </div>
      ))}
    </div>
  );
}
