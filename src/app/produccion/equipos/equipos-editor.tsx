"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import {
  PROCESO_LABELS,
  PROCESOS,
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
  encargado: "",
  es_planta: false,
  procesos: ["armado"],
  activo: true,
};

// Catálogo de equipos: alta, edición y desactivación (no se borran: tienen
// historial de asignaciones).
export default function EquiposEditor({
  equipos,
  puedeEditar,
}: {
  equipos: EquipoProduccion[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function editar(b: Borrador) {
    setBorrador({ ...b, encargado: b.encargado ?? "" });
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
      encargado: borrador.encargado?.trim() || null,
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

  return (
    <>
      {puedeEditar && (
        <div>
          <button type="button" onClick={() => editar(NUEVO)} className={estiloBotonPrimario}>
            Nuevo equipo
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Equipo</th>
              <th className="px-4 py-3">Encargado</th>
              <th className="px-4 py-3">Procesos</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Estado</th>
              {puedeEditar && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {equipos.map((e) => (
              <tr key={e.id} className={e.activo ? "" : "text-slate-400"}>
                <td className="px-4 py-3 font-medium">{e.nombre}</td>
                <td className="px-4 py-3">{e.encargado ?? "—"}</td>
                <td className="px-4 py-3">{e.procesos.map((p) => PROCESO_LABELS[p]).join(", ")}</td>
                <td className="px-4 py-3">{e.es_planta ? "Planta" : "Maquilador"}</td>
                <td className="px-4 py-3">{e.activo ? "Activo" : "Inactivo"}</td>
                {puedeEditar && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => editar(e)}
                      className="text-sm font-medium text-indigo-600 hover:underline"
                    >
                      Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
            <label className={estiloEtiqueta}>
              Encargado del equipo (opcional)
              <input
                maxLength={80}
                value={borrador.encargado ?? ""}
                onChange={(e) => setBorrador({ ...borrador, encargado: e.target.value })}
                className={estiloCampo}
              />
            </label>
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
