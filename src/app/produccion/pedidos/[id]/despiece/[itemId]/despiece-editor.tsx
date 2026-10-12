"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { formatoFechaHora } from "@/lib/resumen/entrega";
import { mensajeErrorRpc } from "@/lib/produccion/asignaciones";
import {
  MATERIALES_SUGERIDOS,
  leerCantidad,
  limpiarLineas,
  mismasLineas,
  totalLinea,
  validarLineas,
  type LineaDespiece,
  type SugerenciaDespiece,
} from "@/lib/produccion/despiece";
import {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
} from "@/app/produccion/asignaciones/modal";

interface Fila {
  clave: number;
  descripcion: string;
  material: string;
  unidad: string;
  piezas: string;
  hijoId: string | null;
  aviso: string | null;
}

let ultimaClave = 0;

function filasDesde(lineas: LineaDespiece[], avisos: (string | null)[] = []): Fila[] {
  return lineas.map((l, i) => ({
    clave: ++ultimaClave,
    descripcion: l.descripcion,
    material: l.material ?? "",
    unidad: l.unidad ?? "",
    piezas: String(l.piezas_por_mueble),
    hijoId: l.hijo_id,
    aviso: avisos[i] ?? null,
  }));
}

function lineasDesde(filas: Fila[]): LineaDespiece[] {
  return filas.map((f) => ({
    descripcion: f.descripcion,
    material: f.material || null,
    unidad: f.unidad || null,
    piezas_por_mueble: leerCantidad(f.piezas),
    hijo_id: f.hijoId,
  }));
}

function numero(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

const GRID = "sm:grid-cols-[minmax(0,1fr)_9rem_6rem_6rem_7rem_2.5rem]";

function Campo({
  etiqueta,
  className = "",
  children,
}: {
  etiqueta: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-slate-500 sm:sr-only">{etiqueta}</span>
      {children}
    </label>
  );
}

// Despiece del mueble: arranca con la sugerencia del sistema (hecha con los
// componentes del PM) o con lo que ya guardó Producción. El trabajador lo
// ajusta como le sirva y lo guarda; nada se guarda hasta que lo hace.
export default function DespieceEditor({
  itemId,
  muebles,
  unidadMueble,
  sugerencia,
  guardado,
  puedeEditar,
  motivoBloqueo,
}: {
  itemId: string;
  // Cantidad del mueble en el PM: el despiece es de UN mueble y se multiplica.
  muebles: number;
  unidadMueble: string | null;
  sugerencia: SugerenciaDespiece;
  guardado: { lineas: LineaDespiece[]; igualASugerencia: boolean; actualizadoEn: string } | null;
  puedeEditar: boolean;
  motivoBloqueo: string | null;
}) {
  const router = useRouter();
  const [filas, setFilas] = useState<Fila[]>(() =>
    guardado ? filasDesde(guardado.lineas) : filasDesde(sugerencia.lineas, sugerencia.avisosPorLinea)
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actuales = lineasDesde(filas);
  const cambiado = !mismasLineas(actuales, guardado ? guardado.lineas : sugerencia.lineas);
  const distintoDeLaSugerencia = !mismasLineas(actuales, sugerencia.lineas);

  function cambiar(clave: number, campo: "descripcion" | "material" | "unidad" | "piezas", valor: string) {
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, [campo]: valor } : f)));
  }

  function agregar() {
    setFilas((prev) => [
      ...prev,
      { clave: ++ultimaClave, descripcion: "", material: "", unidad: "", piezas: "1", hijoId: null, aviso: null },
    ]);
  }

  function quitar(clave: number) {
    setFilas((prev) => (prev.length > 1 ? prev.filter((f) => f.clave !== clave) : prev));
  }

  function volverALaSugerencia() {
    setFilas(filasDesde(sugerencia.lineas, sugerencia.avisosPorLinea));
    setError(null);
  }

  async function guardar() {
    const lineas = limpiarLineas(actuales);
    const problema = validarLineas(lineas);
    if (problema) {
      setError(problema);
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: fallo } = await createClient().rpc("guardar_despiece_produccion", {
      p_item_id: itemId,
      p_lineas: lineas,
      p_igual_a_sugerencia: mismasLineas(lineas, sugerencia.lineas),
    });
    setGuardando(false);
    if (fallo) {
      setError(mensajeErrorRpc(fallo.message));
      return;
    }
    avisar("Despiece guardado");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Despiece del mueble">
      {guardado ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">
            Despiece guardado el {formatoFechaHora(guardado.actualizadoEn)}
            {guardado.igualASugerencia ? " · igual a la sugerencia del sistema" : ""}
          </p>
          {cambiado && puedeEditar && <p className="mt-1 text-amber-700">Tienes cambios sin guardar.</p>}
        </div>
      ) : (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <p className="font-medium">Sugerencia del sistema</p>
          <p className="mt-1">
            Armada con los componentes de este mueble en el PM. Todavía no está guardada: úsala tal cual o
            ajústala como te sirva en el taller.
          </p>
        </div>
      )}

      <p className="text-sm text-slate-600">
        Cada línea es lo que lleva <strong className="font-semibold">un</strong> mueble.
        {muebles > 0
          ? ` Con ${numero(muebles)}${unidadMueble ? ` ${unidadMueble}` : ""} en el PM, el total de cada línea se multiplica por ${numero(muebles)}.`
          : ""}
      </p>

      {sugerencia.avisos.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {sugerencia.avisos.map((a) => (
            <li key={a}>⚠ {a}</li>
          ))}
        </ul>
      )}

      {motivoBloqueo && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{motivoBloqueo}</p>
      )}
      {!puedeEditar && !motivoBloqueo && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Solo Producción puede guardar el despiece; aquí lo puedes consultar.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div
          className={`hidden gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid ${GRID}`}
          aria-hidden="true"
        >
          <span>Descripción</span>
          <span>Material</span>
          <span>Unidad</span>
          <span>Por mueble</span>
          <span>Para {numero(muebles)}</span>
          <span />
        </div>

        {filas.map((f, i) => {
          const piezas = leerCantidad(f.piezas);
          return (
            <div
              key={f.clave}
              className={`grid grid-cols-2 items-end gap-2 border-t border-slate-100 pt-3 sm:items-start sm:border-0 sm:pt-0 ${GRID}`}
            >
              <Campo etiqueta="Descripción" className="col-span-2 sm:col-span-1">
                <input
                  value={f.descripcion}
                  onChange={(e) => cambiar(f.clave, "descripcion", e.target.value)}
                  readOnly={!puedeEditar}
                  maxLength={300}
                  className={estiloCampo}
                />
              </Campo>
              <Campo etiqueta="Material">
                <input
                  value={f.material}
                  onChange={(e) => cambiar(f.clave, "material", e.target.value)}
                  readOnly={!puedeEditar}
                  list="materiales-despiece"
                  maxLength={60}
                  className={estiloCampo}
                />
              </Campo>
              <Campo etiqueta="Unidad">
                <input
                  value={f.unidad}
                  onChange={(e) => cambiar(f.clave, "unidad", e.target.value)}
                  readOnly={!puedeEditar}
                  maxLength={30}
                  className={estiloCampo}
                />
              </Campo>
              <Campo etiqueta="Por mueble">
                <input
                  value={f.piezas}
                  onChange={(e) => cambiar(f.clave, "piezas", e.target.value)}
                  readOnly={!puedeEditar}
                  inputMode="decimal"
                  className={`${estiloCampo} tabular-nums`}
                />
              </Campo>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 sm:sr-only">Para {numero(muebles)}</span>
                <span className="py-2.5 text-base tabular-nums text-slate-900 sm:py-2 sm:text-sm">
                  {Number.isFinite(piezas) ? numero(totalLinea(piezas, muebles)) : "—"}
                  {f.unidad ? ` ${f.unidad}` : ""}
                </span>
              </div>
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => quitar(f.clave)}
                  disabled={filas.length <= 1}
                  aria-label={`Quitar la línea ${i + 1}`}
                  title="Quitar la línea"
                  className="flex h-11 w-11 items-center justify-center justify-self-end rounded-lg border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 sm:h-10 sm:w-10"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
              {f.aviso && <p className="col-span-full text-xs text-amber-700">⚠ {f.aviso}</p>}
            </div>
          );
        })}
        <datalist id="materiales-despiece">
          {MATERIALES_SUGERIDOS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={agregar} className={estiloBotonSecundario}>
            Agregar línea
          </button>
          {distintoDeLaSugerencia && (
            <button type="button" onClick={volverALaSugerencia} className={estiloBotonSecundario}>
              Volver a la sugerencia
            </button>
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || (!!guardado && !cambiado)}
            className={`${estiloBotonPrimario} ml-auto`}
          >
            {guardando ? "Guardando…" : !guardado && !cambiado ? "Usar esta sugerencia" : "Guardar despiece"}
          </button>
        </div>
      )}
    </section>
  );
}
