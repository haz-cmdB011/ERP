"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import {
  PROCESO_LABELS,
  PROCESOS,
  hoyMexico,
  encargadosDeEquipo,
  mensajeErrorRpc,
  type EncargadoEquipo,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import Modal, {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
  estiloEtiqueta,
} from "./modal";
import CampoEncargado from "./campo-encargado";

// Asigna parte (o todo) un mueble a un equipo. Se puede repetir para repartir
// el mismo modelo entre varios equipos o con la planta; la base no deja pasar
// de la cantidad del mueble por proceso.
export default function AsignarForm({
  itemId,
  descripcion,
  unidad,
  disponible,
  aplica,
  equipos,
  encargados,
  procesoInicial: procesoPedido,
  children,
  className,
  titulo,
}: {
  itemId: string;
  descripcion: string;
  unidad: string | null;
  disponible: Record<Proceso, number>;
  // Procesos que el mueble lleva (Electrificación y Superficie Sólida dependen
  // de su descripción o la de sus componentes). Sin el dato, todos aplican.
  aplica?: Record<Proceso, boolean>;
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
  // Para abrir el formulario ya en un proceso (desde el flujo del PM).
  procesoInicial?: Proceso;
  // Contenido y estilo del botón que lo abre (por omisión, "Asignar").
  children?: ReactNode;
  className?: string;
  titulo?: string;
}) {
  const router = useRouter();
  const procesoInicial =
    procesoPedido && disponible[procesoPedido] > 0
      ? procesoPedido
      : (PROCESOS.find((p) => disponible[p] > 0) ?? "armado");
  const [abierto, setAbierto] = useState(false);
  const [proceso, setProceso] = useState<Proceso>(procesoInicial);
  const [equipoId, setEquipoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const [encargado, setEncargado] = useState("");
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
    setEncargado("");
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
      p_encargado: encargado,
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
        title={sinDisponible ? "Ya está asignado todo el mueble" : titulo}
        className={
          className ??
          "rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
        }
      >
        {children ?? "Asignar"}
      </button>
      {abierto && (
        <Modal titulo="Asignar a un equipo" subtitulo={descripcion} onCerrar={() => !enviando && setAbierto(false)}>
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <fieldset className="grid grid-cols-2 gap-2">
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
                    {aplica && !aplica[p]
                      ? "No aplica a este mueble"
                      : `${disponible[p]} ${unidad ?? ""} por asignar`}
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
            <CampoEncargado
              valor={encargado}
              onCambio={setEncargado}
              sugerencias={encargadosDeEquipo(encargados, equipoId)}
            />
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
