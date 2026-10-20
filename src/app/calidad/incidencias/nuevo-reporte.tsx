"use client";

import { useState } from "react";
import FormularioReporte, { type OpcionesFormulario } from "./formulario-reporte";

// Botón "Nuevo reporte" del encabezado: abre el formulario de alta. Con
// `sugerido` (se llegó con "Reportar falla" desde un pedido) ya abre prellenado.
export default function NuevoReporte({
  opciones,
  hoy,
  sugerido = null,
}: {
  opciones: OpcionesFormulario;
  hoy: string;
  sugerido?: { proyecto: string; muebles: string[] } | null;
}) {
  const [abierto, setAbierto] = useState(sugerido !== null);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400 max-md:min-h-11"
      >
        Nuevo reporte
      </button>
      {abierto && (
        <FormularioReporte opciones={opciones} hoy={hoy} sugerido={sugerido} onCerrar={() => setAbierto(false)} />
      )}
    </>
  );
}
