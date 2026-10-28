"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Chevron from "@/components/chevron";
import { avisar } from "@/components/avisos";
import {
  PROCESO_LABELS,
  PROCESOS,
  encargadosDeEquipo,
  type EncargadoEquipo,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import Modal, {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
  estiloEtiqueta,
} from "../asignaciones/modal";

// Un punto de color por proceso: es lo único con color en la lista.
const COLOR_PROCESO: Record<Proceso, string> = {
  armado: "bg-amber-500",
  barniz: "bg-sky-500",
  electrificacion: "bg-violet-500",
  superficie_solida: "bg-teal-600",
};

type Borrador = Omit<EquipoProduccion, "id"> & { id: string | null };

const NUEVO: Borrador = {
  id: null,
  nombre: "",
  encargado: null,
  es_planta: false,
  procesos: ["armado"],
  activo: true,
};

// Catálogo de equipos: alta, edición y desactivación (no se borran: tienen
// historial de asignaciones).
export default function EquiposEditor({
  equipos,
  encargados,
  puedeEditar,
}: {
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function editar(b: Borrador) {
    setBorrador({ ...b });
    setError(null);
  }

  function alternarProceso(p: Proceso) {
    if (!borrador) return;
    const procesos = borrador.procesos.includes(p)
      ? borrador.procesos.filter((x) => x !== p)
      : PROCESOS.filter((x) => x === p || borrador.procesos.includes(x));
    setBorrador({ ...borrador, procesos });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!borrador) return;
    if (borrador.procesos.length === 0) {
      setError("Elige al menos un proceso.");
      return;
    }
    setEnviando(true);
    setError(null);
    const datos = {
      nombre: borrador.nombre.trim(),
      es_planta: borrador.es_planta,
      procesos: borrador.procesos,
      activo: borrador.activo,
    };
    const supabase = createClient();
    const { error } = borrador.id
      ? await supabase.from("equipos_produccion").update(datos).eq("id", borrador.id)
      : await supabase.from("equipos_produccion").insert(datos);
    setEnviando(false);
    if (error) {
      setError(
        error.code === "23505" ? "Ya existe un equipo con ese nombre." : `No se pudo guardar: ${error.message}`
      );
      return;
    }
    setBorrador(null);
    avisar("Equipo guardado");
    router.refresh();
  }

  const vigentes = equipos.filter((e) => e.activo);
  const inactivos = equipos.filter((e) => !e.activo);

  // Una fila por equipo: el nombre manda y solo se escribe lo que es excepción (planta, inactivo,
  // encargado cuando lo hay). El lápiz aparece al señalar la fila o al enfocarla con el teclado.
  function Fila({ e }: { e: EquipoProduccion }) {
    const encargadosTexto = [
      ...(e.encargado ? [e.encargado] : []),
      ...encargadosDeEquipo(encargados, e.id),
    ].join(", ");
    return (
      <li key={e.id} className="group relative">
        <span
          aria-hidden="true"
          className="absolute inset-y-3 left-0 w-1 origin-top scale-y-0 rounded-full bg-brand-500 transition-transform duration-200 group-focus-within:scale-y-100 group-hover:scale-y-100"
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-slate-200 py-4 pl-5 pr-2 transition-colors group-hover:bg-slate-50">
          <div className="min-w-40 flex-1">
            <p className={`truncate text-xl font-semibold ${e.activo ? "text-slate-900" : "text-slate-500"}`}>
              {e.nombre}
              {e.es_planta && (
                <span className="ml-3 rounded bg-slate-900 px-2 py-0.5 align-middle text-xs font-medium text-white">
                  Planta
                </span>
              )}
            </p>
            {encargadosTexto && <p className="truncate text-sm text-slate-500">{encargadosTexto}</p>}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {e.procesos.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={`size-2 rounded-full ${COLOR_PROCESO[p]}`} />
                {PROCESO_LABELS[p]}
              </span>
            ))}
          </p>
          {puedeEditar && (
            <button
              type="button"
              onClick={() => editar(e)}
              aria-label={`Editar ${e.nombre}`}
              title="Editar"
              className="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 transition-all hover:bg-white hover:text-brand-800 hover:ring-1 hover:ring-slate-300 focus-visible:opacity-100 pointer-coarse:opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <>
      {puedeEditar && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => editar(NUEVO)}
            className={`${estiloBotonPrimario} inline-flex items-center gap-2 text-base`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo equipo
          </button>
        </div>
      )}

      <ul className="border-t border-slate-200">
        {vigentes.map((e) => Fila({ e }))}
      </ul>

      {inactivos.length > 0 && (
        <details className="group/inactivos">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 [&::-webkit-details-marker]:hidden">
            <Chevron abierto={false} className="h-3.5 w-3.5 group-open/inactivos:rotate-90" />
            Inactivos ({inactivos.length})
          </summary>
          <ul className="mt-2 border-t border-slate-200">
            {inactivos.map((e) => Fila({ e }))}
          </ul>
        </details>
      )}

      {borrador && (
        <Modal
          titulo={borrador.id ? "Editar equipo" : "Nuevo equipo"}
          onCerrar={() => !enviando && setBorrador(null)}
        >
          <form onSubmit={guardar} className="flex flex-col gap-3">
            <label className={estiloEtiqueta}>
              Nombre del equipo
              <input
                required
                maxLength={80}
                value={borrador.nombre}
                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                placeholder="Ej. Armado — Juan Pérez"
                className={estiloCampo}
              />
            </label>
            <p className="text-xs text-slate-500">
              El encargado no se captura aquí: se escribe al asignar piezas al equipo y queda guardado en él.
            </p>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium text-slate-700">Procesos que hace</legend>
              {PROCESOS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={borrador.procesos.includes(p)}
                    onChange={() => alternarProceso(p)}
                  />
                  {PROCESO_LABELS[p]}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={borrador.es_planta}
                onChange={(e) => setBorrador({ ...borrador, es_planta: e.target.checked })}
              />
              Es planta (trabajadores de la empresa)
            </label>
            {borrador.id && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={borrador.activo}
                  onChange={(e) => setBorrador({ ...borrador, activo: e.target.checked })}
                />
                Activo (los inactivos no aparecen al asignar; su historial se conserva)
              </label>
            )}
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBorrador(null)}
                disabled={enviando}
                className={estiloBotonSecundario}
              >
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
