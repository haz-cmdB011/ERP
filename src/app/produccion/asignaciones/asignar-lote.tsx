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

export interface MuebleParaLote {
  id: string;
  item_code: number;
  modelo: string | null;
  unidad: string | null;
  // Lo que falta por asignar de cada proceso.
  disponible: Record<Proceso, number>;
}

interface Fallo {
  id: string;
  texto: string;
}

const MOTIVO_DESHACER = "Deshecha por quien la creó (asignación en lote).";

// Asigna a un mismo equipo todo lo que falta de varios muebles de un PM, en un
// solo paso: se elige el proceso y el equipo, se marcan los muebles y cada uno
// se asigna completo. Cada mueble se asigna por separado (la base valida cada
// uno), así que si alguno falla los demás quedan hechos y aquí se listan los
// que no pasaron. El aviso de éxito trae "Deshacer", que cancela solo las
// asignaciones recién creadas.
export default function AsignarLote({
  muebles,
  equipos,
}: {
  muebles: MuebleParaLote[];
  equipos: EquipoProduccion[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [proceso, setProceso] = useState<Proceso>("armado");
  const [equipoId, setEquipoId] = useState("");
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);
  const [fallos, setFallos] = useState<Fallo[]>([]);

  const candidatos = useMemo(() => muebles.filter((m) => m.disponible[proceso] > 0), [muebles, proceso]);
  const equiposDelProceso = useMemo(
    () => equipos.filter((e) => e.activo && e.procesos.includes(proceso)),
    [equipos, proceso]
  );
  const procesosConTrabajo = PROCESOS.filter((p) => muebles.some((m) => m.disponible[p] > 0));
  const nombreDe = (id: string) => {
    const m = muebles.find((x) => x.id === id);
    return m ? `${m.item_code}${m.modelo ? ` · ${m.modelo}` : ""}` : id;
  };

  function abrir() {
    const inicial = procesosConTrabajo[0] ?? "armado";
    setProceso(inicial);
    setEquipoId("");
    setFecha(hoyMexico());
    setNotas("");
    setSeleccion(new Set(muebles.filter((m) => m.disponible[inicial] > 0).map((m) => m.id)));
    setFallos([]);
    setProgreso(null);
    setAbierto(true);
  }

  function cambiarProceso(p: Proceso) {
    setProceso(p);
    setSeleccion(new Set(muebles.filter((m) => m.disponible[p] > 0).map((m) => m.id)));
    if (!equipos.some((e) => e.id === equipoId && e.procesos.includes(p))) setEquipoId("");
    setFallos([]);
  }

  function alternar(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const todosMarcados = candidatos.length > 0 && candidatos.every((m) => seleccion.has(m.id));

  async function deshacer(ids: string[]) {
    const supabase = createClient();
    let fallidas = 0;
    for (const id of ids) {
      const { error } = await supabase.rpc("cancelar_asignacion_produccion", {
        p_asignacion_id: id,
        p_motivo: MOTIVO_DESHACER,
      });
      if (error) fallidas++;
    }
    if (fallidas === 0) avisar(ids.length === 1 ? "Asignación deshecha." : `${ids.length} asignaciones deshechas.`, "info");
    else avisar(`No se pudieron deshacer ${fallidas} de ${ids.length} asignaciones; revisa la lista.`, "error");
    router.refresh();
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const elegidos = candidatos.filter((m) => seleccion.has(m.id));
    if (elegidos.length === 0 || !equipoId) return;
    setEnviando(true);
    setFallos([]);
    const supabase = createClient();
    const creadas: string[] = [];
    const falladas: Fallo[] = [];
    for (const [i, m] of elegidos.entries()) {
      setProgreso({ hecho: i, total: elegidos.length });
      const { data, error } = await supabase.rpc("crear_asignacion_produccion", {
        p_item_id: m.id,
        p_equipo_id: equipoId,
        p_proceso: proceso,
        p_cantidad: m.disponible[proceso],
        p_fecha_asignacion: fecha,
        p_notas: notas,
      });
      if (error || typeof data !== "string") {
        falladas.push({ id: m.id, texto: error ? mensajeErrorRpc(error.message) : "Sin respuesta." });
      } else {
        creadas.push(data);
      }
    }
    setProgreso(null);
    setEnviando(false);

    if (creadas.length > 0) {
      avisar(
        creadas.length === 1 ? "1 asignación guardada." : `${creadas.length} asignaciones guardadas.`,
        "exito",
        { etiqueta: "Deshacer", alHacer: () => deshacer(creadas) }
      );
      router.refresh();
    }
    if (falladas.length === 0) {
      setAbierto(false);
      return;
    }
    // Lo que falló queda marcado para reintentar sin repetir lo ya asignado.
    setFallos(falladas);
    setSeleccion(new Set(falladas.map((f) => f.id)));
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        disabled={procesosConTrabajo.length === 0}
        title={procesosConTrabajo.length === 0 ? "Ya está asignado todo" : undefined}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Asignar varios a un equipo
      </button>
      {abierto && (
        <Modal
          titulo="Asignar varios muebles"
          subtitulo="Cada mueble se asigna completo (lo que falta) al mismo equipo."
          onCerrar={() => !enviando && setAbierto(false)}
        >
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <fieldset className="flex gap-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Proceso</legend>
              {PROCESOS.map((p) => {
                const hay = muebles.filter((m) => m.disponible[p] > 0).length;
                return (
                  <label
                    key={p}
                    className={`flex flex-1 cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm ${
                      proceso === p ? "border-slate-900 bg-slate-50" : "border-slate-200"
                    } ${hay === 0 ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <input
                        type="radio"
                        name="proceso-lote"
                        value={p}
                        checked={proceso === p}
                        disabled={hay === 0 || enviando}
                        onChange={() => cambiarProceso(p)}
                      />
                      {PROCESO_LABELS[p]}
                    </span>
                    <span className="text-xs text-slate-500">
                      {hay} mueble{hay === 1 ? "" : "s"} por asignar
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <label className={estiloEtiqueta}>
              Equipo
              <select
                required
                value={equipoId}
                disabled={enviando}
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

            <label className={estiloEtiqueta}>
              Fecha de asignación
              <input
                type="date"
                required
                value={fecha}
                disabled={enviando}
                onChange={(e) => setFecha(e.target.value)}
                className={estiloCampo}
              />
            </label>

            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium text-slate-700">
                <span>
                  Muebles ({seleccion.size} de {candidatos.length})
                </span>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() =>
                    setSeleccion(todosMarcados ? new Set() : new Set(candidatos.map((m) => m.id)))
                  }
                  className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
                >
                  {todosMarcados ? "Quitar todos" : "Marcar todos"}
                </button>
              </legend>
              <ul className="flex max-h-56 flex-col divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {candidatos.map((m) => (
                  <li key={m.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={seleccion.has(m.id)}
                        disabled={enviando}
                        onChange={() => alternar(m.id)}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                        {m.item_code}
                        {m.modelo ? ` · ${m.modelo}` : ""}
                      </span>
                      <span className="whitespace-nowrap text-xs text-slate-600">
                        {m.disponible[proceso]} {m.unidad ?? ""}
                      </span>
                    </label>
                  </li>
                ))}
                {candidatos.length === 0 && (
                  <li className="px-3 py-3 text-sm text-slate-500">
                    Ya está asignado todo el {PROCESO_LABELS[proceso].toLowerCase()}.
                  </li>
                )}
              </ul>
            </fieldset>

            <label className={estiloEtiqueta}>
              Notas (opcional, para todos)
              <input
                type="text"
                maxLength={300}
                value={notas}
                disabled={enviando}
                onChange={(e) => setNotas(e.target.value)}
                className={estiloCampo}
              />
            </label>

            {progreso && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-600">
                  <span>
                    Asignando {progreso.hecho + 1} de {progreso.total}…
                  </span>
                  <span className="font-medium tabular-nums">
                    {Math.round((progreso.hecho / progreso.total) * 100)}%
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((progreso.hecho / progreso.total) * 100)}
                  aria-label="Progreso de la asignación"
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                >
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                    style={{ width: `${(progreso.hecho / progreso.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {fallos.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-medium">
                  {fallos.length === 1 ? "1 mueble no se pudo asignar" : `${fallos.length} muebles no se pudieron asignar`}
                  ; los demás sí quedaron. Los que fallaron siguen marcados para reintentar:
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {fallos.map((f) => (
                    <li key={f.id}>
                      {nombreDe(f.id)}: {f.texto}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="sticky bottom-0 -mx-5 -mb-5 mt-1 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3 sm:static sm:m-0 sm:border-0 sm:p-0">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={enviando}
                className={estiloBotonSecundario}
              >
                {fallos.length > 0 ? "Cerrar" : "Cancelar"}
              </button>
              <button
                type="submit"
                disabled={enviando || !equipoId || seleccion.size === 0}
                className={estiloBotonPrimario}
              >
                {enviando
                  ? "Asignando…"
                  : `Asignar ${seleccion.size} mueble${seleccion.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
