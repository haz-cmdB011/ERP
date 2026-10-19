"use client";

import { useState, type ReactNode } from "react";
import {
  ESTADO_ASIGNACION_ESTILOS,
  ESTADO_ASIGNACION_LABELS,
  PROCESO_LABELS,
  PROCESOS,
  formatoFecha,
  type EncargadoEquipo,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import {
  avanceProceso,
  estadoMueble,
  porcentaje,
  siguientePaso,
  totalesProceso,
  type EstadoMueble,
  type EstadoProceso,
  type MuebleFlujo,
} from "@/lib/produccion/flujo-mueble";
import AsignarForm from "@/app/produccion/asignaciones/asignar-form";

// Color de cada estado (variables de la paleta: el tema oscuro las invierte).
const COLOR: Record<EstadoProceso, string> = {
  terminado: "var(--color-emerald-500)",
  en_proceso: "var(--color-sky-500)",
  sin_asignar: "var(--color-amber-500)",
  no_aplica: "var(--color-slate-300)",
};

const FILTROS: { valor: EstadoMueble | "todos"; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "por_asignar", etiqueta: "Por asignar" },
  { valor: "en_proceso", etiqueta: "En proceso" },
  { valor: "terminado", etiqueta: "Terminados" },
];

// Lo que hace falta para asignar desde el flujo (null si no puede asignar).
export interface AsignarDesdeFlujo {
  equipos: EquipoProduccion[];
  encargados: EncargadoEquipo[];
  // Prefijo del subtítulo del formulario ("PM135-26").
  numeroPedido: string;
  // Lo que falta por asignar de cada proceso, por mueble.
  disponible: Record<string, Record<Proceso, number>>;
}

// El avance del PM de un vistazo: cuánto lleva cada proceso y, por mueble, en
// qué paso va (Armado → Barniz → Electrificación → Superficie Sólida). Los
// procesos que un mueble no lleva salen apagados. Tocar un proceso con piezas
// por asignar abre el formulario de asignación en ese proceso.
export default function FlujoMuebles({
  muebles,
  asignar,
  detalles,
}: {
  muebles: MuebleFlujo[];
  asignar: AsignarDesdeFlujo | null;
  // Entregas y acciones de cada asignación (registrar entrega, cancelar...),
  // armadas en el servidor; por id de asignación.
  detalles: Record<string, ReactNode>;
}) {
  const [filtro, setFiltro] = useState<EstadoMueble | "todos">("todos");
  const [abierto, setAbierto] = useState<string | null>(null);

  const procesos = PROCESOS.filter((p) => muebles.some((m) => m.aplica[p]));
  const estados = new Map(muebles.map((m) => [m.id, estadoMueble(m)]));
  const cuenta = (f: EstadoMueble | "todos") =>
    f === "todos"
      ? muebles.length
      : muebles.filter((m) => estados.get(m.id) === f).length;
  const visibles = muebles.filter(
    (m) => filtro === "todos" || estados.get(m.id) === filtro,
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {procesos.map((p) => (
          <ResumenProceso key={p} proceso={p} muebles={muebles} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filtrar muebles"
        >
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              onClick={() => setFiltro(f.valor)}
              aria-pressed={filtro === f.valor}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filtro === f.valor
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {f.etiqueta} <span className="opacity-70">{cuenta(f.valor)}</span>
            </button>
          ))}
        </div>
        {asignar && (
          <p className="text-xs text-slate-500">
            Toca un proceso con <span className="font-bold">+</span> para
            asignarlo.
          </p>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
          No hay muebles en este filtro.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((m) => (
            <FilaMueble
              key={m.id}
              mueble={m}
              procesos={procesos}
              asignar={asignar}
              detalles={detalles}
              abierto={abierto === m.id}
              onAlternar={() => setAbierto(abierto === m.id ? null : m.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ResumenProceso({
  proceso,
  muebles,
}: {
  proceso: Proceso;
  muebles: MuebleFlujo[];
}) {
  const t = totalesProceso(muebles, proceso);
  const pctEntregado = porcentaje(t.entregado, t.piezas);
  const pctAsignado = porcentaje(t.asignado, t.piezas);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">
          {PROCESO_LABELS[proceso]}
        </p>
        <p className="text-2xl font-bold tabular-nums text-slate-900">
          {pctEntregado}%
        </p>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-sky-200 transition-[width] duration-700"
          style={{ width: `${pctAsignado}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-[width] duration-700"
          style={{ width: `${pctEntregado}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500 tabular-nums">
        {t.entregado}/{t.piezas} pzas entregadas · {t.asignado} asignadas
      </p>
      <p className="text-xs text-slate-400">
        {t.muebles} mueble{t.muebles === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// Botón que abre el formulario de asignación ya en un proceso.
function BotonAsignar({
  mueble: m,
  proceso,
  asignar,
  className,
  titulo,
  children,
}: {
  mueble: MuebleFlujo;
  proceso: Proceso;
  asignar: AsignarDesdeFlujo;
  className: string;
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <AsignarForm
      itemId={m.id}
      descripcion={`${asignar.numeroPedido} · ítem ${m.item_code}${m.modelo ? ` · ${m.modelo}` : ""}`}
      unidad={m.unidad}
      disponible={asignar.disponible[m.id]}
      aplica={m.aplica}
      equipos={asignar.equipos}
      encargados={asignar.encargados}
      procesoInicial={proceso}
      className={className}
      titulo={titulo}
    >
      {children}
    </AsignarForm>
  );
}

function porAsignar(
  m: MuebleFlujo,
  p: Proceso,
  asignar: AsignarDesdeFlujo | null,
): asignar is AsignarDesdeFlujo {
  return !!asignar && (asignar.disponible[m.id]?.[p] ?? 0) > 0;
}

function FilaMueble({
  mueble: m,
  procesos,
  asignar,
  detalles,
  abierto,
  onAlternar,
}: {
  mueble: MuebleFlujo;
  procesos: Proceso[];
  asignar: AsignarDesdeFlujo | null;
  detalles: Record<string, ReactNode>;
  abierto: boolean;
  onAlternar: () => void;
}) {
  const siguiente = siguientePaso(m);
  const terminado = siguiente === "Terminado";
  // El proceso que toca asignar (para el botón de la derecha).
  const procesoSiguiente = PROCESOS.find(
    (p) => avanceProceso(m, p).estado === "sin_asignar",
  );
  const estiloPildora =
    "self-start rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap sm:self-center";

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierto}
          className="flex min-w-0 items-center gap-2 text-left sm:w-48"
        >
          <span
            aria-hidden
            className={`text-slate-400 transition-transform ${abierto ? "rotate-90" : ""}`}
          >
            ▸
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-slate-900">
              <span className="text-slate-400">{m.item_code} ·</span>{" "}
              {m.modelo ?? "Sin modelo"}
            </span>
            <span className="block text-xs text-slate-500">
              {m.cantidad} {m.unidad ?? ""} · ver detalle
            </span>
          </span>
        </button>

        <ol className="flex flex-1 items-center">
          {procesos.map((p, i) => (
            <li key={p} className="flex flex-1 items-center last:flex-none">
              {porAsignar(m, p, asignar) ? (
                <BotonAsignar
                  mueble={m}
                  proceso={p}
                  asignar={asignar}
                  titulo={`Asignar ${PROCESO_LABELS[p]}`}
                  className="group rounded-lg p-1 transition-colors hover:bg-slate-100 focus-visible:bg-slate-100"
                >
                  <Paso mueble={m} proceso={p} conMas />
                </BotonAsignar>
              ) : (
                <button
                  type="button"
                  onClick={onAlternar}
                  className="rounded-lg p-1 transition-colors hover:bg-slate-50"
                >
                  <Paso mueble={m} proceso={p} />
                </button>
              )}
              {i < procesos.length - 1 && (
                <span
                  aria-hidden
                  className="mx-1 h-0.5 flex-1 rounded-full transition-colors"
                  style={{
                    background:
                      avanceProceso(m, p).estado === "terminado"
                        ? COLOR.terminado
                        : "var(--color-slate-200)",
                  }}
                />
              )}
            </li>
          ))}
        </ol>

        {terminado ? (
          <span className={`${estiloPildora} bg-emerald-50 text-emerald-700`}>
            ✓ Terminado
          </span>
        ) : procesoSiguiente && porAsignar(m, procesoSiguiente, asignar) ? (
          <BotonAsignar
            mueble={m}
            proceso={procesoSiguiente}
            asignar={asignar}
            className={`${estiloPildora} bg-amber-500 text-white shadow-sm transition-colors hover:bg-amber-600`}
          >
            + Asignar {PROCESO_LABELS[procesoSiguiente]}
          </BotonAsignar>
        ) : (
          <span
            className={`${estiloPildora} ${
              siguiente.startsWith("Asignar")
                ? "bg-amber-50 text-amber-700"
                : "bg-sky-50 text-sky-700"
            }`}
          >
            {siguiente} →
          </span>
        )}
      </div>

      {abierto && (
        <DetalleMueble
          mueble={m}
          procesos={procesos}
          asignar={asignar}
          detalles={detalles}
        />
      )}
    </li>
  );
}

// Un paso del flujo: anillo con el avance (entregado / cantidad). Con `conMas`
// lleva un "+" porque al tocarlo se asigna.
function Paso({
  mueble: m,
  proceso,
  conMas = false,
}: {
  mueble: MuebleFlujo;
  proceso: Proceso;
  conMas?: boolean;
}) {
  const a = avanceProceso(m, proceso);
  const pct =
    a.estado === "terminado" ? 100 : porcentaje(a.entregado, m.cantidad);
  const color = COLOR[a.estado];
  const titulo =
    a.estado === "no_aplica"
      ? `${PROCESO_LABELS[proceso]}: no aplica`
      : `${PROCESO_LABELS[proceso]}: ${a.entregado}/${m.cantidad} entregadas, ${a.asignado} asignadas`;

  return (
    <span className="flex flex-col items-center gap-1" title={titulo}>
      <span
        className={`relative grid size-10 place-items-center rounded-full transition-[background,transform] duration-300 group-hover:scale-110 ${
          a.estado === "no_aplica" ? "opacity-40" : ""
        }`}
        style={{
          background:
            a.estado === "sin_asignar"
              ? "transparent"
              : `conic-gradient(${color} ${pct}%, var(--color-slate-200) 0)`,
          border:
            a.estado === "sin_asignar" ? `2px dashed ${color}` : undefined,
        }}
      >
        <span
          className="grid size-8 place-items-center rounded-full bg-white text-[10px] font-bold tabular-nums"
          style={{
            color: a.estado === "no_aplica" ? "var(--color-slate-400)" : color,
          }}
        >
          {a.estado === "terminado"
            ? "✓"
            : a.estado === "no_aplica"
              ? "—"
              : a.estado === "sin_asignar"
                ? "+"
                : `${pct}%`}
        </span>
        {conMas && a.estado !== "sin_asignar" && (
          <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-amber-500 text-[10px] font-bold leading-none text-white">
            +
          </span>
        )}
      </span>
      <span
        className={`text-[11px] leading-tight ${
          a.estado === "no_aplica"
            ? "text-slate-400 line-through"
            : "font-medium text-slate-700"
        }`}
      >
        {PROCESO_LABELS[proceso]}
      </span>
    </span>
  );
}

function DetalleMueble({
  mueble: m,
  procesos,
  asignar,
  detalles,
}: {
  mueble: MuebleFlujo;
  procesos: Proceso[];
  asignar: AsignarDesdeFlujo | null;
  detalles: Record<string, ReactNode>;
}) {
  return (
    <div className="grid gap-3 border-t border-slate-100 bg-slate-50 p-3 lg:grid-cols-2">
      {procesos.map((p) => {
        const lista = m.asignaciones.filter((a) => a.proceso === p);
        return (
          <div key={p} className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-700">
                {PROCESO_LABELS[p]}
              </p>
              {porAsignar(m, p, asignar) && (
                <BotonAsignar
                  mueble={m}
                  proceso={p}
                  asignar={asignar}
                  className="rounded-md bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-on-brand transition-colors hover:bg-brand-400"
                >
                  + Asignar ({asignar.disponible[m.id][p]})
                </BotonAsignar>
              )}
            </div>
            {!m.aplica[p] ? (
              <p className="text-slate-400">No aplica a este mueble</p>
            ) : lista.length === 0 ? (
              <p className="text-amber-700">Sin asignar</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {lista.map((a) => (
                  <li key={a.id}>
                    <details className="rounded-lg bg-white">
                      <summary className="cursor-pointer p-2">
                        <p className="flex flex-wrap items-center gap-x-2 font-medium text-slate-900">
                          {a.equipo}
                          {a.encargado ? ` · ${a.encargado}` : ""}
                          {a.folio_rechazo ? " (retrabajo)" : ""}
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${ESTADO_ASIGNACION_ESTILOS[a.estado]}`}
                          >
                            {ESTADO_ASIGNACION_LABELS[a.estado]}
                          </span>
                        </p>
                        <p className="text-slate-600 tabular-nums">
                          {Number(a.entregado)}/{Number(a.cantidad)} · asig.{" "}
                          {formatoFecha(a.fecha_asignacion)}
                          {a.ultima_entrega
                            ? ` · entr. ${formatoFecha(a.ultima_entrega)}`
                            : ""}
                        </p>
                        {(a.folios_calidad || a.folios_cal) && (
                          <p className="text-slate-500">
                            {[a.folios_calidad, a.folios_cal]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </summary>
                      {detalles[a.id] && (
                        <div className="border-t border-slate-100 p-2">
                          {detalles[a.id]}
                        </div>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
