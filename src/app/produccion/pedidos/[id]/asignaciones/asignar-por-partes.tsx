"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { mensajeErrorRpc } from "@/lib/produccion/asignaciones";
import Modal, { estiloBotonPrimario, estiloBotonSecundario } from "@/app/produccion/asignaciones/modal";

// El interruptor de un mueble con despiece: asignar el mueble completo (lo normal) o por partes
// (cada parte con su ruta, asignada y entregada en sus piezas). Migración asignar_por_partes.
// La base se niega si hay asignaciones que lo impiden y lo dice; guardar exige la versión de la
// ruta que se abrió, así que si alguien la cambió antes, se avisa en vez de pisarla.
export default function AsignarPorPartes({
  itemId,
  descripcion,
  version,
  activar,
  className,
  children,
}: {
  itemId: string;
  descripcion: string;
  version: number;
  // true: pasar a asignar por partes; false: volver al mueble completo.
  activar: boolean;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    const { error: e } = await createClient().rpc(
      activar ? "activar_asignacion_por_partes" : "desactivar_asignacion_por_partes",
      { p_item_id: itemId, p_version_esperada: version }
    );
    setEnviando(false);
    if (e) {
      setError(mensajeErrorRpc(e.message));
      return;
    }
    setAbierto(false);
    avisar(activar ? "Ahora se asigna por partes." : "Ahora se asigna el mueble completo.");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={className}>
        {children}
      </button>
      {abierto && (
        <Modal
          titulo={activar ? "Asignar por partes" : "Asignar el mueble completo"}
          subtitulo={descripcion}
          onCerrar={() => !enviando && setAbierto(false)}
        >
          <div className="flex flex-col gap-3 text-sm text-slate-700">
            {activar ? (
              <>
                <p>
                  Cada parte del despiece tendrá su propia ruta, según los procesos por los que pasa
                  (&quot;Pasa por&quot; en el despiece), y se asigna y se entrega en sus piezas. El mueble cuenta
                  como completo cuando la parte más atrasada termina su ruta.
                </p>
                <p className="text-slate-500">
                  La ruta del mueble completo se quita. Puedes volver mientras ninguna parte tenga asignaciones.
                </p>
              </>
            ) : (
              <p>
                Las partes dejan de asignarse aparte y el mueble vuelve a llevar una sola ruta. Solo se puede si
                ninguna parte tiene asignaciones vigentes.
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} disabled={enviando} className={estiloBotonSecundario}>
                Cancelar
              </button>
              <button type="button" onClick={confirmar} disabled={enviando} className={estiloBotonPrimario}>
                {enviando ? "Guardando…" : activar ? "Asignar por partes" : "Volver al mueble completo"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
