"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NoConformidadCampos from "@/app/calidad/no-conformidad-campos";
import Modal, { estiloBotonPrimario, estiloBotonSecundario } from "@/app/produccion/asignaciones/modal";
import { avisar } from "@/components/avisos";
import { cerrarNoConformidad, guardarNoConformidad } from "@/lib/calidad/guardar-no-conformidad";
import { validarDetalle, type DetalleNoConformidad } from "@/lib/calidad/no-conformidad";

// Calidad completa o corrige el detalle de una no conformidad ya emitida: lo
// típico es agregar la solución, el material, la severidad y la causa raíz
// cuando se resuelve, o fotos que faltaron. El folio y el veredicto no cambian.
// Un reporte sin lote se cierra (o reabre) aquí; el de un lote se cierra solo
// cuando Calidad aprueba el retrabajo.
export default function EditarNoConformidad({
  informeId,
  inicial,
  pedirPiezas,
  fotosExistentes,
  cerrado,
  puedeCerrarAMano,
}: {
  informeId: string;
  inicial: DetalleNoConformidad;
  pedirPiezas: boolean;
  fotosExistentes: number;
  cerrado: boolean;
  puedeCerrarAMano: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState(inicial);
  const [fotos, setFotos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const problema = validarDetalle(detalle, pedirPiezas);
    if (problema) {
      setError(problema);
      return;
    }
    setEnviando(true);
    setError(null);
    const incompleto = await guardarNoConformidad(informeId, detalle, fotos);
    setEnviando(false);
    if (incompleto) {
      setError(incompleto);
    } else {
      setAbierto(false);
      setFotos([]);
      avisar("No conformidad actualizada.");
    }
    router.refresh();
  }

  async function cambiarCierre() {
    const error = await cerrarNoConformidad(informeId, !cerrado);
    if (error) avisar(error, "error");
    else avisar(cerrado ? "Reporte reabierto." : "Reporte cerrado.");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDetalle(inicial);
          setError(null);
          setAbierto(true);
        }}
        className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden"
      >
        Completar / editar no conformidad
      </button>
      {puedeCerrarAMano && (
        <button
          type="button"
          onClick={cambiarCierre}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden"
        >
          {cerrado ? "Reabrir reporte" : "Cerrar reporte"}
        </button>
      )}
      {abierto && (
        <Modal titulo="No conformidad" onCerrar={() => !enviando && setAbierto(false)}>
          <form onSubmit={guardar} className="flex flex-col gap-3">
            <NoConformidadCampos
              valor={detalle}
              onCambio={setDetalle}
              fotos={fotos}
              onFotos={setFotos}
              pedirPiezas={pedirPiezas}
              fotosExistentes={fotosExistentes}
            />
            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} disabled={enviando} className={estiloBotonSecundario}>
                Cancelar
              </button>
              <button type="submit" disabled={enviando} className={estiloBotonPrimario}>
                {enviando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
