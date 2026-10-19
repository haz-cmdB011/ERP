"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import {
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

// Un paso de la ruta del mueble, tal como se ofrece en el formulario.
export interface OpcionPaso {
  // Posición en la ruta (0 = primer paso).
  indice: number;
  // null mientras la ruta sea la sugerida y no se haya guardado: la base usa el
  // paso de ese proceso.
  id: string | null;
  proceso: Proceso;
  etiqueta: string;
  // Lo que falta por asignar en el paso (tope: la cantidad del mueble).
  disponible: number;
  // Lo que ya entregó el paso anterior y aún no se asigna aquí.
  listo: number;
  // Etiqueta del paso anterior (null en el primero).
  anterior: string | null;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

// Asigna parte (o todo) un paso de la ruta de un mueble a un equipo. Se puede
// repetir para repartir el mismo paso entre varios equipos o con la planta; la
// base no deja pasar de la cantidad del mueble en cada paso. Asignar más de lo
// que el paso anterior ya entregó se permite, con aviso: queda marcado como
// adelantado.
export default function AsignarForm({
  itemId,
  descripcion,
  unidad,
  pasos,
  equipos,
  encargados,
  pasoInicial: pasoPedido,
  children,
  className,
  titulo,
}: {
  itemId: string;
  descripcion: string;
  unidad: string | null;
  pasos: OpcionPaso[];
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
  // Para abrir el formulario ya en un paso (desde el flujo del PM).
  pasoInicial?: number;
  // Contenido y estilo del botón que lo abre (por omisión, "Asignar").
  children?: ReactNode;
  className?: string;
  titulo?: string;
}) {
  const router = useRouter();
  const indiceInicial =
    pasoPedido !== undefined && (pasos[pasoPedido]?.disponible ?? 0) > 0
      ? pasoPedido
      : Math.max(0, pasos.findIndex((p) => p.disponible > 0));
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(indiceInicial);
  const [equipoId, setEquipoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const [encargado, setEncargado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paso = pasos[indice] as OpcionPaso | undefined;
  const proceso = paso?.proceso;
  const equiposDelProceso = useMemo(
    () => (proceso ? equipos.filter((e) => e.activo && e.procesos.includes(proceso)) : []),
    [equipos, proceso]
  );
  const sinDisponible = pasos.every((p) => p.disponible <= 0);
  const cantidadNum = Number(cantidad.replace(",", "."));
  // Cuánto se adelanta al paso anterior (solo aviso).
  const adelanto =
    paso && paso.anterior && Number.isFinite(cantidadNum) && cantidadNum > paso.listo
      ? Math.round((cantidadNum - paso.listo) * 100) / 100
      : 0;

  // Por omisión, lo que ya está listo; si nada lo está, todo lo disponible.
  const cantidadSugerida = (p: OpcionPaso) => fmt(p.listo > 0 ? p.listo : p.disponible);

  function abrir() {
    setIndice(indiceInicial);
    setEquipoId("");
    setCantidad(pasos[indiceInicial] ? cantidadSugerida(pasos[indiceInicial]) : "");
    setFecha(hoyMexico());
    setNotas("");
    setEncargado("");
    setError(null);
    setAbierto(true);
  }

  function cambiarPaso(i: number) {
    setIndice(i);
    setCantidad(cantidadSugerida(pasos[i]));
    if (!equipos.some((e) => e.id === equipoId && e.procesos.includes(pasos[i].proceso))) setEquipoId("");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!paso) return;
    setEnviando(true);
    setError(null);
    const { error } = await createClient().rpc("crear_asignacion_produccion", {
      p_item_id: itemId,
      p_equipo_id: equipoId,
      p_proceso: paso.proceso,
      p_cantidad: cantidadNum,
      p_fecha_asignacion: fecha,
      p_notas: notas,
      p_encargado: encargado,
      p_paso_id: paso.id,
    });
    setEnviando(false);
    if (error) {
      setError(mensajeErrorRpc(error.message));
      return;
    }
    setAbierto(false);
    avisar(adelanto > 0 ? "Asignación guardada (adelantada al paso anterior)" : "Asignación guardada");
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
              <legend className="mb-1 text-sm font-medium text-slate-700">Paso de la ruta</legend>
              {pasos.map((p) => (
                <label
                  key={p.indice}
                  className={`flex flex-1 cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm ${
                    indice === p.indice ? "border-slate-900 bg-slate-50" : "border-slate-200"
                  } ${p.disponible <= 0 ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    <input
                      type="radio"
                      name="paso"
                      value={p.indice}
                      checked={indice === p.indice}
                      disabled={p.disponible <= 0}
                      onChange={() => cambiarPaso(p.indice)}
                    />
                    {p.indice + 1}. {p.etiqueta}
                  </span>
                  <span className="text-xs text-slate-500">
                    {p.disponible <= 0
                      ? "Ya está asignado todo"
                      : `${fmt(p.disponible)} ${unidad ?? ""} por asignar`}
                    {p.anterior && p.disponible > 0 ? ` · ${fmt(p.listo)} listas` : ""}
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
                  max={paso?.disponible}
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
            {adelanto > 0 && paso && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                {paso.anterior} solo ha entregado {fmt(paso.listo)} {unidad ?? ""} listas para este paso.
                Si asignas {fmt(cantidadNum)}, {fmt(adelanto)} se adelantan: se puede, pero la asignación
                queda marcada como adelantada.
              </p>
            )}
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
                {enviando ? "Guardando…" : adelanto > 0 ? "Asignar de todos modos" : "Asignar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
