"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { PROCESO_LABELS, mensajeErrorRpc, type Proceso } from "@/lib/produccion/asignaciones";
import {
  MAX_PASOS,
  ORDEN_SUGERIDO,
  etiquetaPaso,
  moverPaso,
  pasosParaGuardar,
  type PasoRuta,
} from "@/lib/produccion/ruta";
import Modal, { estiloBotonPrimario, estiloBotonSecundario } from "@/app/produccion/asignaciones/modal";

// En el editor cada paso lleva una clave propia: los nuevos aún no tienen id.
interface PasoEditable extends PasoRuta {
  clave: string;
  // Tiene asignaciones vigentes: no se puede quitar.
  bloqueado: boolean;
}

let siguienteClave = 0;
const nuevaClave = () => `nuevo-${++siguienteClave}`;

// Cambia la ruta de un mueble: el orden de los pasos, repetir un proceso
// (Armado → Barniz → Armado) o quitar los que no lleva. Un paso con asignaciones
// no se quita (la base tampoco lo deja). Guardar exige la versión que se abrió:
// si alguien la cambió antes, se avisa en vez de pisarla.
export default function EditarRuta({
  itemId,
  descripcion,
  ruta,
  version,
  aplica,
  bloqueados,
  className,
  children,
}: {
  itemId: string;
  descripcion: string;
  ruta: PasoRuta[];
  version: number;
  aplica: Record<Proceso, boolean>;
  // Por paso de `ruta`: true si tiene asignaciones vigentes.
  bloqueados: boolean[];
  className?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pasos, setPasos] = useState<PasoEditable[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir() {
    setPasos(
      ruta.map((p, i) => ({ ...p, clave: p.id ?? nuevaClave(), bloqueado: bloqueados[i] ?? false }))
    );
    setError(null);
    setAbierto(true);
  }

  const mover = (i: number, d: -1 | 1) => setPasos((prev) => moverPaso(prev, i, d));
  const quitar = (i: number) => setPasos((prev) => prev.filter((_, j) => j !== i));
  const agregar = (proceso: Proceso) =>
    setPasos((prev) => [...prev, { id: null, proceso, clave: nuevaClave(), bloqueado: false }]);

  const disponibles = ORDEN_SUGERIDO.filter((p) => aplica[p]);
  const lleno = pasos.length >= MAX_PASOS;

  async function guardar() {
    setEnviando(true);
    setError(null);
    const { error } = await createClient().rpc("guardar_ruta_produccion", {
      p_item_id: itemId,
      p_pasos: pasosParaGuardar(pasos),
      p_version_esperada: version,
    });
    setEnviando(false);
    if (error) {
      setError(mensajeErrorRpc(error.message));
      return;
    }
    setAbierto(false);
    avisar("Ruta guardada");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={
          className ??
          "rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-400"
        }
      >
        {children ?? "Editar ruta"}
      </button>
      {abierto && (
        <Modal titulo="Ruta del mueble" subtitulo={descripcion} onCerrar={() => !enviando && setAbierto(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              El orden en que el mueble pasa por los procesos. Un proceso puede repetirse (por ejemplo,
              Armado → Barniz → Armado); cada vez se asigna aparte.
            </p>
            <ol className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
              {pasos.map((p, i) => (
                <li key={p.clave} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-6 text-right font-semibold tabular-nums text-slate-400">{i + 1}.</span>
                  <span className="flex-1 font-medium text-slate-900">
                    {etiquetaPaso(pasos, i)}
                    {p.bloqueado && (
                      <span className="ml-2 text-xs font-normal text-slate-500">con asignaciones</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    disabled={i === 0 || enviando}
                    aria-label={`Subir ${etiquetaPaso(pasos, i)}`}
                    className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={i === pasos.length - 1 || enviando}
                    aria-label={`Bajar ${etiquetaPaso(pasos, i)}`}
                    className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => quitar(i)}
                    disabled={p.bloqueado || pasos.length === 1 || enviando}
                    title={p.bloqueado ? "Tiene asignaciones: cancélalas antes de quitar el paso" : undefined}
                    className="rounded px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-600">Agregar paso:</span>
              {disponibles.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => agregar(p)}
                  disabled={lleno || enviando}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-40"
                >
                  + {PROCESO_LABELS[p]}
                </button>
              ))}
            </div>
            {lleno && <p className="text-xs text-slate-500">La ruta llega a {MAX_PASOS} pasos como máximo.</p>}
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
              <button
                type="button"
                onClick={guardar}
                disabled={enviando || pasos.length === 0}
                className={estiloBotonPrimario}
              >
                {enviando ? "Guardando…" : "Guardar ruta"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
