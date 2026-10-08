"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import {
  PROCESO_LABELS,
  hoyMexico,
  leerCantidad,
  leerFecha,
  mensajeErrorRpc,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import Modal, {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
  estiloEtiqueta,
} from "../asignaciones/modal";

// Reasigna (todo o parte de) lo que Calidad rechazó en un lote a un equipo que
// haga el mismo proceso. Sugiere el equipo que lo entregó; el retrabajo no
// cuenta contra la cantidad del mueble.
export default function ReasignarRetrabajo({
  informeId,
  folio,
  descripcion,
  proceso,
  equipoOriginalId,
  porReasignar,
  unidad,
  equipos,
}: {
  informeId: string;
  folio: string;
  descripcion: string;
  proceso: Proceso;
  equipoOriginalId: string;
  porReasignar: number;
  unidad: string | null;
  equipos: EquipoProduccion[];
}) {
  const router = useRouter();
  const opciones = useMemo(
    () => equipos.filter((e) => e.activo && e.procesos.includes(proceso)),
    [equipos, proceso]
  );
  const sugerido = opciones.some((e) => e.id === equipoOriginalId) ? equipoOriginalId : (opciones[0]?.id ?? "");
  const [abierto, setAbierto] = useState(false);
  const [equipoId, setEquipoId] = useState(sugerido);
  const [cantidad, setCantidad] = useState(String(porReasignar));
  const [fecha, setFecha] = useState(hoyMexico());
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir() {
    setEquipoId(sugerido);
    setCantidad(String(porReasignar));
    setFecha(hoyMexico());
    setNotas("");
    setError(null);
    setAbierto(true);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const n = leerCantidad(cantidad);
    const f = leerFecha(fecha);
    if (!equipoId) return setError("Elige un equipo.");
    if (n === null) return setError("La cantidad debe ser mayor que cero.");
    if (n > porReasignar) return setError(`Solo quedan ${porReasignar} por reasignar.`);
    if (!f) return setError("Fecha no válida.");
    setEnviando(true);
    setError(null);
    const { error } = await createClient().rpc("crear_retrabajo_produccion", {
      p_informe_id: informeId,
      p_equipo_id: equipoId,
      p_cantidad: n,
      p_fecha_asignacion: f,
      p_notas: notas,
    });
    setEnviando(false);
    if (error) {
      setError(mensajeErrorRpc(error.message));
      return;
    }
    setAbierto(false);
    avisar(`Retrabajo de ${folio} asignado`);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400 max-md:min-h-11"
      >
        Reasignar
      </button>
      {abierto && (
        <Modal
          titulo={`Reasignar retrabajo · ${folio}`}
          subtitulo={`${descripcion} · ${PROCESO_LABELS[proceso]}`}
          onCerrar={() => !enviando && setAbierto(false)}
        >
          <form onSubmit={enviar} className="flex flex-col gap-3">
            {opciones.length === 0 ? (
              <p className="text-sm text-rose-700">
                No hay equipos activos de {PROCESO_LABELS[proceso].toLowerCase()}. Da uno de alta en Equipos.
              </p>
            ) : (
              <label className={estiloEtiqueta}>
                Equipo
                <select value={equipoId} onChange={(e) => setEquipoId(e.target.value)} className={estiloCampo}>
                  {opciones.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.nombre}
                      {eq.id === equipoOriginalId ? " (lo entregó)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className={estiloEtiqueta}>
                Cantidad ({unidad ?? "pz"})
                <input
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={estiloCampo}
                />
              </label>
              <label className={estiloEtiqueta}>
                Fecha de asignación
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={estiloCampo} />
              </label>
            </div>
            <label className={estiloEtiqueta}>
              Notas (opcional)
              <textarea
                rows={2}
                maxLength={300}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className={estiloCampo}
              />
            </label>
            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={enviando}
                className={estiloBotonSecundario}
              >
                Cancelar
              </button>
              <button type="submit" disabled={enviando || opciones.length === 0} className={estiloBotonPrimario}>
                {enviando ? "Guardando…" : "Asignar retrabajo"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
