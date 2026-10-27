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
  puedeMover,
  type PasoRuta,
} from "@/lib/produccion/ruta";
import Modal, { estiloBotonPrimario, estiloBotonSecundario } from "@/app/produccion/asignaciones/modal";

// En el editor cada paso lleva una clave propia: los nuevos aún no tienen id.
interface PasoEditable extends PasoRuta {
  clave: string;
  // Tiene asignaciones vigentes: no se puede quitar ni cruzar con otro que tenga.
  bloqueado: boolean;
}

let siguienteClave = 0;
const nuevaClave = () => `nuevo-${++siguienteClave}`;

// Cambia UNA ruta: la del mueble completo o la de una parte de su despiece (migración
// rutas_por_parte). Son independientes: lo que se agrega aquí no aparece en las demás.
// El orden de los pasos, repetir un proceso (Armado → Barniz → Armado), agregar o quitar.
// Un paso con asignaciones no se quita ni cambia de orden con otro que también tenga (la
// base tampoco lo deja). Guardar exige la versión que se abrió: si alguien cambió alguna
// ruta del mueble antes, se avisa en vez de pisarla.
export default function EditarRuta({
  itemId,
  descripcion,
  parte,
  conPartes = false,
  ruta,
  version,
  aplica,
  bloqueados,
  className,
  titulo,
  children,
}: {
  itemId: string;
  descripcion: string;
  // La parte cuya ruta se edita; omitida, la del mueble completo.
  parte?: { id: string; descripcion: string };
  // El mueble tiene partes: su ruta puede quedar vacía (todo se hace en las partes).
  conPartes?: boolean;
  ruta: PasoRuta[];
  version: number;
  aplica: Record<Proceso, boolean>;
  // Por paso de `ruta`: true si tiene asignaciones vigentes.
  bloqueados: boolean[];
  className?: string;
  titulo?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pasos, setPasos] = useState<PasoEditable[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const puedeVaciarse = !!parte || conPartes;

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

  // El mueble completo de un mueble con partes no lleva Barniz (se barnizan las partes) hasta
  // que se demuestre lo contrario; uno que ya lo tenga lo conserva y se puede quitar.
  const sinBarniz = conPartes && !parte;
  const disponibles = ORDEN_SUGERIDO.filter((p) => aplica[p] && !(sinBarniz && p === "barniz"));
  const lleno = pasos.length >= MAX_PASOS;

  async function guardar() {
    setEnviando(true);
    setError(null);
    const { error } = await createClient().rpc("guardar_ruta_produccion", {
      p_item_id: itemId,
      p_pasos: pasosParaGuardar(pasos),
      p_version_esperada: version,
      p_parte_id: parte?.id ?? null,
    });
    setEnviando(false);
    if (error) {
      setError(mensajeErrorRpc(error.message));
      return;
    }
    setAbierto(false);
    avisar(parte ? `Ruta de "${parte.descripcion}" guardada` : "Ruta del mueble guardada");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title={titulo}
        className={
          className ??
          "rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-400"
        }
      >
        {children ?? "Editar ruta"}
      </button>
      {abierto && (
        <Modal
          titulo={parte ? `Ruta de "${parte.descripcion}"` : "Ruta del mueble completo"}
          subtitulo={descripcion}
          onCerrar={() => !enviando && setAbierto(false)}
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              {parte
                ? "Los procesos por los que pasa esta parte, en orden. Solo cambia esta parte: el mueble y las demás partes conservan su ruta."
                : conPartes
                  ? "Lo que se le hace al mueble ya armado con sus partes, después de que terminan (el ensamble es un Armado). El Barniz va en las partes. Si todo se hace en ellas, déjala vacía."
                  : "El orden en que el mueble pasa por los procesos."}{" "}
              Un proceso puede repetirse (Armado → Barniz → Armado) y cada vez se asigna aparte.
            </p>
            {pasos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-sm text-slate-500">
                Sin pasos.
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
                {pasos.map((p, i) => (
                  <li key={p.clave} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="w-6 text-right font-semibold tabular-nums text-slate-500">{i + 1}.</span>
                    <span className="flex-1 font-medium text-slate-900">
                      {etiquetaPaso(pasos, i)}
                      {p.bloqueado && <span className="ml-2 text-xs font-normal text-slate-500">con asignaciones</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => mover(i, -1)}
                      disabled={!puedeMover(pasos, i, -1) || enviando}
                      title={i > 0 && !puedeMover(pasos, i, -1) ? "Los dos pasos tienen asignaciones: no cambian de orden" : undefined}
                      aria-label={`Subir ${etiquetaPaso(pasos, i)}`}
                      className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(i, 1)}
                      disabled={!puedeMover(pasos, i, 1) || enviando}
                      title={
                        i < pasos.length - 1 && !puedeMover(pasos, i, 1)
                          ? "Los dos pasos tienen asignaciones: no cambian de orden"
                          : undefined
                      }
                      aria-label={`Bajar ${etiquetaPaso(pasos, i)}`}
                      className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => quitar(i)}
                      disabled={p.bloqueado || (pasos.length === 1 && !puedeVaciarse) || enviando}
                      title={p.bloqueado ? "Tiene asignaciones: cancélalas antes de quitar el paso" : undefined}
                      className="rounded px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ol>
            )}
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
                disabled={enviando || (pasos.length === 0 && !puedeVaciarse)}
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
