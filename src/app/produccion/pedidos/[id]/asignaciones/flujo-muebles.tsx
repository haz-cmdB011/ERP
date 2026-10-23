"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import ImagenAmpliable from "@/components/imagen-ampliable";
import {
  ESTADO_ASIGNACION_ESTILOS,
  ESTADO_ASIGNACION_LABELS,
  PROCESO_LABELS,
  formatoFecha,
  type EncargadoEquipo,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import {
  asignacionesDelPaso,
  avancePaso,
  estadoMueble,
  estadoObra,
  indiceSiguiente,
  opcionesDePasos,
  pasoConAsignaciones,
  porcentaje,
  siguientePaso,
  totalesProceso,
  type EstadoMueble,
  type EstadoProceso,
  type MuebleFlujo,
} from "@/lib/produccion/flujo-mueble";
import { ORDEN_SUGERIDO, etiquetaPaso, textoRuta } from "@/lib/produccion/ruta";
import AsignarForm from "@/app/produccion/asignaciones/asignar-form";
import EditarRuta from "./editar-ruta";

// Color de cada estado (variables de la paleta: el tema oscuro las invierte).
const COLOR: Record<EstadoProceso, string> = {
  terminado: "var(--color-emerald-500)",
  en_proceso: "var(--color-sky-500)",
  sin_asignar: "var(--color-amber-500)",
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
}

const subtitulo = (m: MuebleFlujo, asignar: AsignarDesdeFlujo) =>
  `${asignar.numeroPedido} · ítem ${m.item_code}${m.modelo ? ` · ${m.modelo}` : ""}`;

// El avance del PM de un vistazo: cuánto lleva cada proceso y, por mueble, en
// qué paso de su ruta va (la sugerida es Armado → Superficie Sólida → Barniz →
// Electrificación; el trabajador la cambia y puede repetir pasos). Tocar un
// paso con piezas por asignar abre el formulario de asignación en ese paso.
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

  const procesos = ORDEN_SUGERIDO.filter((p) => muebles.some((m) => m.ruta.some((x) => x.proceso === p)));
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
            Toca un paso con <span className="font-bold">+</span> para
            asignarlo. La ruta se cambia en el detalle del mueble.
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

export function ResumenProceso({
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
      <p className="text-xs text-slate-500">
        {t.muebles} mueble{t.muebles === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// Botón que abre el formulario de asignación ya en un paso.
function BotonAsignar({
  mueble: m,
  indice,
  asignar,
  className,
  titulo,
  children,
}: {
  mueble: MuebleFlujo;
  indice: number;
  asignar: AsignarDesdeFlujo;
  className: string;
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <AsignarForm
      itemId={m.id}
      descripcion={subtitulo(m, asignar)}
      unidad={m.unidad}
      pasos={opcionesDePasos(m)}
      equipos={asignar.equipos}
      encargados={asignar.encargados}
      partes={m.partes}
      pasoInicial={indice}
      className={className}
      titulo={titulo}
    >
      {children}
    </AsignarForm>
  );
}

function porAsignar(
  m: MuebleFlujo,
  indice: number,
  asignar: AsignarDesdeFlujo | null,
): asignar is AsignarDesdeFlujo {
  return !!asignar && avancePaso(m, indice).disponible > 0;
}

export function FilaMueble({
  mueble: m,
  asignar,
  detalles,
  abierto,
  onAlternar,
  imagen,
}: {
  mueble: MuebleFlujo;
  asignar: AsignarDesdeFlujo | null;
  detalles: Record<string, ReactNode>;
  abierto: boolean;
  onAlternar: () => void;
  // Miniatura del mueble, discreta y a la vista: con imagen se muestra (y se amplía al tocarla), con
  // null queda un cuadro vacío para que las filas no se desalineen y omitida no hay lugar para ella.
  imagen?: { url: string; urlGrande: string | null } | null;
}) {
  const siguiente = siguientePaso(m);
  const terminado = siguiente === "Terminado";
  const obra = estadoObra(m);
  // El paso que toca asignar (para el botón de la derecha).
  const i = indiceSiguiente(m);
  const indiceAsignar = i !== null && avancePaso(m, i).estado === "sin_asignar" ? i : null;
  const estiloPildora =
    "self-start rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap sm:self-center";

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className={`flex min-w-0 items-center gap-2 ${imagen === undefined ? "sm:w-48" : "sm:w-60"}`}>
          {imagen ? (
            <ImagenAmpliable
              url={imagen.url}
              urlGrande={imagen.urlGrande}
              alt={`Ítem ${m.item_code}${m.modelo ? ` — ${m.modelo}` : ""}`}
              className="h-11 w-11"
            />
          ) : (
            imagen === null && (
              <span
                className="block h-11 w-11 shrink-0 rounded border border-dashed border-slate-200"
                title="Sin imagen"
              />
            )
          )}
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={abierto}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span
              aria-hidden
              className={`text-slate-500 transition-transform ${abierto ? "rotate-90" : ""}`}
            >
              ▸
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-slate-900">
                <span className="text-slate-500">{m.item_code} ·</span>{" "}
                {m.modelo ?? "Sin modelo"}
              </span>
              <span className="block text-xs text-slate-500">
                {m.cantidad} {m.unidad ?? ""} · ver detalle
              </span>
            </span>
          </button>
        </div>

        <ol className="flex flex-1 items-center overflow-x-auto">
          {m.ruta.map((p, j) => (
            <li key={p.id ?? `${p.proceso}-${j}`} className="flex flex-1 items-start last:flex-none">
              {porAsignar(m, j, asignar) ? (
                <BotonAsignar
                  mueble={m}
                  indice={j}
                  asignar={asignar}
                  titulo={`Asignar ${etiquetaPaso(m.ruta, j)}`}
                  className="group rounded-lg p-1 transition-colors hover:bg-slate-100 focus-visible:bg-slate-100"
                >
                  <Paso mueble={m} indice={j} conMas />
                </BotonAsignar>
              ) : (
                <button
                  type="button"
                  onClick={onAlternar}
                  className="rounded-lg p-1 transition-colors hover:bg-slate-50"
                >
                  <Paso mueble={m} indice={j} />
                </button>
              )}
              {j < m.ruta.length - 1 && (
                // A la altura del centro del círculo (p-1 del botón + mitad de size-10,
                // menos la mitad del grosor), no del paso con su etiqueta.
                <span
                  aria-hidden
                  className="mx-1 mt-[23px] h-0.5 min-w-2 flex-1 rounded-full transition-colors"
                  style={{
                    background:
                      avancePaso(m, j).estado === "terminado"
                        ? COLOR.terminado
                        : "var(--color-slate-200)",
                  }}
                />
              )}
            </li>
          ))}
        </ol>

        {terminado && obra === "en_revision_final" ? (
          <span
            className={`${estiloPildora} bg-sky-50 text-sky-700`}
            title="Toda la ruta está terminada; falta la revisión final de Calidad"
          >
            Revisión final {m.revisionFinal?.aprobadas ?? 0}/{m.cantidad}
          </span>
        ) : terminado ? (
          <span className={`${estiloPildora} bg-emerald-50 text-emerald-700`}>
            {obra === "liberado" ? "✓ Liberado a obra" : "✓ Terminado"}
          </span>
        ) : indiceAsignar !== null && porAsignar(m, indiceAsignar, asignar) ? (
          <BotonAsignar
            mueble={m}
            indice={indiceAsignar}
            asignar={asignar}
            className={`${estiloPildora} bg-amber-500 text-white shadow-sm transition-colors hover:bg-amber-600`}
          >
            + Asignar {etiquetaPaso(m.ruta, indiceAsignar)}
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
  indice,
  conMas = false,
}: {
  mueble: MuebleFlujo;
  indice: number;
  conMas?: boolean;
}) {
  const a = avancePaso(m, indice);
  const etiqueta = etiquetaPaso(m.ruta, indice);
  const pct =
    a.estado === "terminado" ? 100 : porcentaje(a.entregado, m.cantidad);
  const color = COLOR[a.estado];
  const titulo = `${indice + 1}. ${etiqueta}: ${a.entregado}/${m.cantidad} entregadas, ${a.asignado} asignadas${
    a.porReasignar > 0 ? `, ${a.porReasignar} rechazadas por Calidad sin reasignar` : ""
  }`;

  return (
    <span className="flex flex-col items-center gap-1" title={titulo}>
      <span
        className="relative grid size-10 place-items-center rounded-full transition-[background,transform] duration-300 group-hover:scale-110"
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
          className="grid size-8 place-items-center rounded-full bg-white text-xs font-bold tabular-nums"
          style={{ color }}
        >
          {a.estado === "terminado"
            ? "✓"
            : a.estado === "sin_asignar"
              ? "+"
              : `${pct}%`}
        </span>
        {a.porReasignar > 0 && (
          <span className="absolute -top-1 -left-1 grid size-4 place-items-center rounded-full bg-rose-500 text-xs font-bold leading-none text-white">
            !
          </span>
        )}
        {conMas && a.estado !== "sin_asignar" && (
          <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-amber-500 text-xs font-bold leading-none text-white">
            +
          </span>
        )}
      </span>
      <span className="text-xs font-medium leading-tight whitespace-nowrap text-slate-700">
        {etiqueta}
      </span>
    </span>
  );
}

function DetalleMueble({
  mueble: m,
  asignar,
  detalles,
}: {
  mueble: MuebleFlujo;
  asignar: AsignarDesdeFlujo | null;
  detalles: Record<string, ReactNode>;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-slate-600">
          <span className="font-semibold text-slate-700">Ruta:</span> {textoRuta(m.ruta)}
          {m.versionRuta === 0 && <span className="text-slate-500"> (sugerida)</span>}
        </p>
        {asignar && (
          <EditarRuta
            itemId={m.id}
            descripcion={subtitulo(m, asignar)}
            ruta={m.ruta}
            version={m.versionRuta}
            aplica={m.aplica}
            bloqueados={m.ruta.map((_, i) => pasoConAsignaciones(m, i))}
          />
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {m.ruta.map((p, i) => {
          const lista = asignacionesDelPaso(m, i);
          const a = avancePaso(m, i);
          return (
            <div key={p.id ?? `${p.proceso}-${i}`} className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-700">
                  {i + 1}. {etiquetaPaso(m.ruta, i)}
                  {i > 0 && a.disponible > 0 && (
                    <span className="ml-1 font-normal text-slate-500">· {a.listo} listas</span>
                  )}
                </p>
                {porAsignar(m, i, asignar) && (
                  <BotonAsignar
                    mueble={m}
                    indice={i}
                    asignar={asignar}
                    className="rounded-md bg-brand-500 px-2 py-0.5 text-xs font-semibold text-on-brand transition-colors hover:bg-brand-400"
                  >
                    + Asignar ({a.disponible})
                  </BotonAsignar>
                )}
              </div>
              {a.porReasignar > 0 && (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">
                  Calidad rechazó {a.porReasignar} {m.unidad ?? "pz"} que faltan por reasignar ·{" "}
                  <Link href="/produccion/rechazos" className="font-medium underline">
                    Rechazado por Calidad
                  </Link>
                </p>
              )}
              {lista.length === 0 ? (
                <p className="text-amber-700">Sin asignar</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {lista.map((x) => (
                    <li key={x.id}>
                      <details className="rounded-lg bg-white">
                        <summary className="cursor-pointer p-2">
                          <p className="flex flex-wrap items-center gap-x-2 font-medium text-slate-900">
                            {x.equipo}
                            {x.encargado ? ` · ${x.encargado}` : ""}
                            {x.folio_rechazo ? " (retrabajo)" : ""}
                            {x.folio_revision_final ? ` (retrabajo de ${x.folio_revision_final})` : ""}
                            <span
                              className={`rounded border px-1.5 py-0.5 text-xs font-medium ${ESTADO_ASIGNACION_ESTILOS[x.estado]}`}
                            >
                              {ESTADO_ASIGNACION_LABELS[x.estado]}
                            </span>
                            {x.adelantada && (
                              <span
                                className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700"
                                title="Se asignó antes de que el paso anterior entregara esas piezas"
                              >
                                Adelantada
                              </span>
                            )}
                          </p>
                          <p className="text-slate-600 tabular-nums">
                            {Number(x.entregado)}/{Number(x.cantidad)} · asig.{" "}
                            {formatoFecha(x.fecha_asignacion)}
                            {x.ultima_entrega
                              ? ` · entr. ${formatoFecha(x.ultima_entrega)}`
                              : ""}
                          </p>
                          {(x.folios_calidad || x.folios_cal) && (
                            <p className="text-slate-500">
                              {[x.folios_calidad, x.folios_cal]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </summary>
                        {detalles[x.id] && (
                          <div className="border-t border-slate-100 p-2">
                            {detalles[x.id]}
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
    </div>
  );
}
