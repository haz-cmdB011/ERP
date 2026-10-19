"use client";

import { useState } from "react";
import FormularioReporte, { type OpcionesFormulario } from "./formulario-reporte";

// Botón "Nuevo reporte" del encabezado: abre el formulario de alta.
export default function NuevoReporte({ opciones, hoy }: { opciones: OpcionesFormulario; hoy: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400 max-md:min-h-11"
      >
        Nuevo reporte
      </button>
      {abierto && <FormularioReporte opciones={opciones} hoy={hoy} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
