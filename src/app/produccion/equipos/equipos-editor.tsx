"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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

  const activos = equipos.filter((e) => e.activo).length;
  const planta = equipos.filter((e) => e.es_planta).length;
  const resumen = [
    { valor: equipos.length, etiqueta: "Equipos" },
    { valor: activos, etiqueta: "Activos" },
    { valor: equipos.length - planta, etiqueta: "Maquiladores" },
    { valor: planta, etiqueta: "Planta" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {resumen.map((r) => (
            <div key={r.etiqueta} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <dd className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">{r.valor}</dd>
              <dt className="text-sm text-slate-500">{r.etiqueta}</dt>
            </div>
          ))}
        </dl>
        {puedeEditar && (
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
        )}
      </div>

      <ul className="lista-animada grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {equipos.map((e) => {
          const nombresEncargados = [
            ...(e.encargado ? [e.encargado] : []),
            ...encargadosDeEquipo(encargados, e.id),
          ].join(", ");
          return (
            <li
              key={e.id}
              className={`group flex flex-col gap-4 rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                e.activo
                  ? "border-slate-200 bg-white hover:border-brand-400"
                  : "border-dashed border-slate-300 bg-slate-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`grid size-12 shrink-0 place-items-center rounded-full text-lg font-bold ${
                    e.activo ? "bg-brand-100 text-brand-800" : "bg-slate-200 text-slate-500"
                  }`}
                  aria-hidden="true"
                >
                  {e.nombre.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className={`truncate text-lg font-bold ${e.activo ? "text-slate-900" : "text-slate-500"}`}>
                    {e.nombre}
                  </h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        e.es_planta ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {e.es_planta ? "Planta" : "Maquilador"}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 font-medium ${
                        e.activo ? "text-emerald-700" : "text-slate-500"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2 rounded-full ${e.activo ? "bg-emerald-500" : "bg-slate-400"}`}
                      />
                      {e.activo ? "Activo" : "Inactivo"}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5" aria-label="Procesos">
                {e.procesos.map((p) => (
                  <span
                    key={p}
                    className="rounded-lg bg-brand-50 px-2.5 py-1 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-200"
                  >
                    {PROCESO_LABELS[p]}
                  </span>
                ))}
              </div>

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <p className="min-w-0 truncate text-sm text-slate-600">
                  <span className="text-slate-500">Encargado: </span>
                  <span className={nombresEncargados ? "font-medium text-slate-800" : "text-slate-400"}>
                    {nombresEncargados || "—"}
                  </span>
                </p>
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => editar(e)}
                    aria-label={`Editar ${e.nombre}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    Editar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

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
