"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import {
  PROCESO_LABELS,
  PROCESOS,
  hoyMexico,
  mensajeErrorRpc,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import Modal, {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
  estiloEtiqueta,
} from "./modal";

// Asigna parte (o todo) un mueble a un equipo. Se puede repetir para repartir
// el mismo modelo entre varios equipos o con la planta; la base no deja pasar
// de la cantidad del mueble por proceso.
export default function AsignarForm({
  itemId,
  descripcion,
  unidad,
  disponible,
  equipos,
}: {
  itemId: string;
  descripcion: string;
  unidad: string | null;
  disponible: Record<Proceso, number>;
  equipos: EquipoProduccion[];
}) {
  const router = useRouter();
  const procesoInicial = PROCESOS.find((p) => disponible[p] > 0) ?? "armado";
  const [abierto, setAbierto] = useState(false);
  const [proceso, setProceso] = useState<Proceso>(procesoInicial);
  const [equipoId, setEquipoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const equiposDelProceso = useMemo(
    () => equipos.filter((e) => e.activo && e.procesos.includes(proceso)),
    [equipos, proceso]
  );
  const sinDisponible = PROCESOS.every((p) => disponible[p] <= 0);

  function abrir() {
    setProceso(procesoInicial);
    setEquipoId("");
    setCantidad(String(disponible[procesoInicial]));
    setFecha(hoyMexico());
    setNotas("");
    setError(null);
    setAbierto(true);
  }

  function cambiarProceso(p: Proceso) {
    setProceso(p);
    setCantidad(String(disponible[p]));
    if (!equipos.some((e) => e.id === equipoId && e.procesos.includes(p))) setEquipoId("");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await createClient().rpc("crear_asignacion_produccion", {
      p_item_id: itemId,
      p_equipo_id: equipoId,
      p_proceso: proceso,
      p_cantidad: Number(cantidad.replace(",", ".")),
      p_fecha_asignacion: fecha,
      p_notas: notas,
    });
    setEnviando(false);
    if (error) {
      setError(mensajeErrorRpc(error.message));
      return;
    }
    setAbierto(false);
    avisar("Asignación guardada");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        disabled={sinDisponible}
        title={sinDisponible ? "Ya está asignado todo el mueble" : undefined}
        className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Asignar
      </button>
      {abierto && (
        <Modal titulo="Asignar a un equipo" subtitulo={descripcion} onCerrar={() => !enviando && setAbierto(false)}>
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <fieldset className="flex gap-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Proceso</legend>
              {PROCESOS.map((p) => (
                <label
                  key={p}
                  className={`flex flex-1 cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm ${
                    proceso === p ? "border-slate-900 bg-slate-50" : "border-slate-200"
                  } ${disponible[p] <= 0 ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    <input
                      type="radio"
                      name="proceso"
                      value={p}
                      checked={proceso === p}
                      disabled={disponible[p] <= 0}
                      onChange={() => cambiarProceso(p)}
                    />
                    {PROCESO_LABELS[p]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {disponible[p]} {unidad ?? ""} por asignar
                  </span>
                </label>
              ))}
            </fieldset>
            <label className={estiloEtiqueta}>
              Equipo
              <select
                required
                value={equipoId}
                onChange={(e) => setEquipoId(e.target.value)}
                className={estiloCampo}
              >
                <option value="" disabled>
                  {equiposDelProceso.length ? "Elige un equipo" : "No hay equipos de este proceso"}
                </option>
                {equiposDelProceso.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                    {e.es_planta ? " (planta)" : e.encargado ? ` — ${e.encargado}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={estiloEtiqueta}>
                Cantidad
                <input
                  type="number"
                  required
                  min="0.01"
                  max={disponible[proceso]}
                  step="any"
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={estiloCampo}
                />
              </label>
              <label className={estiloEtiqueta}>
                Fecha de asignación
                <input
                  type="date"
                  required
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className={estiloCampo}
                />
              </label>
            </div>
            <label className={estiloEtiqueta}>
              Notas (opcional)
              <input
                type="text"
                maxLength={300}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className={estiloCampo}
              />
            </label>
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
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
              <button type="submit" disabled={enviando || !equipoId} className={estiloBotonPrimario}>
                {enviando ? "Guardando…" : "Asignar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
