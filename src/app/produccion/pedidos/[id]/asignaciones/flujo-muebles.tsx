"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Chevron from "@/components/chevron";
import { usePathname, useSearchParams } from "next/navigation";
import ImagenAmpliable from "@/components/imagen-ampliable";
import {
  ESTADO_ASIGNACION_ESTILOS,
  ESTADO_ASIGNACION_LABELS,
  PROCESO_LABELS,
  formatoFecha,
  type AsignacionResumen,
  type EncargadoEquipo,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import {
  asignacionesDelPaso,
  avanceColumna,
  avanceEnRuta,
  avancePaso,
  avancePonderado,
  columnasMueble,
  encuadreMueble,
  estadoEtapa,
  estadoMueble,
  estadoObra,
  etapaSiguiente,
  opcionesAsignar,
  partesConRuta,
  pasoConAsignaciones,
  pasoEnColumna,
  porcentaje,
  procesosDe,
  requiereDespiece,
  siguienteAsignable,
  siguientePaso,
  totalesProceso,
  type ColumnaProceso,
  type EstadoMueble,
  type EstadoProceso,
  type MuebleFlujo,
  type ParteMueble,
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

const fmt = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 2 });

// El avance del PM de un vistazo: cuánto lleva cada proceso y, por mueble, en
// qué paso va: primero sus partes (cada una con su ruta) y después la ruta del mueble
// completo. Tocar un paso con piezas por asignar abre el formulario de asignación.
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

  const conProceso = procesosDe(muebles);
  const procesos = ORDEN_SUGERIDO.filter((p) => conProceso.has(p));
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
            asignarlo. Las rutas se cambian en el detalle del mueble.
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

// Botón que abre el formulario de asignación ya en una parte (o el mueble completo, parte
// null) y un paso de su ruta.
function BotonAsignar({
  mueble: m,
  inicial,
  asignar,
  className,
  titulo,
  children,
}: {
  mueble: MuebleFlujo;
  inicial?: { parte: string | null; paso?: number };
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
      rutas={opcionesAsignar(m)}
      equipos={asignar.equipos}
      encargados={asignar.encargados}
      faltaDespiece={requiereDespiece(m)}
      inicial={inicial}
      className={className}
      titulo={titulo}
    >
      {children}
    </AsignarForm>
  );
}

// El paso del mueble completo tiene lugar para asignar.
function porAsignar(
  m: MuebleFlujo,
  indice: number,
  asignar: AsignarDesdeFlujo | null,
): asignar is AsignarDesdeFlujo {
  return !!asignar && !requiereDespiece(m) && avancePaso(m, indice).disponible > 0;
}

// Enlace al despiece del mueble (o solo el texto si la pantalla no sabe dónde está).
function EnlaceDespiece({ mueble: m, className, children }: { mueble: MuebleFlujo; className: string; children: ReactNode }) {
  // Al guardar el despiece se regresa a esta misma pantalla (p. ej. el panel con sus ?ids=).
  const pathname = usePathname();
  const busqueda = useSearchParams().toString();
  const volver = `${pathname}${busqueda ? `?${busqueda}` : ""}`;
  return m.despieceHref ? (
    <Link href={`${m.despieceHref}?volver=${encodeURIComponent(volver)}`} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
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
  // Lo que toca asignar (para el botón de la izquierda): las partes o el paso del mueble.
  const etapa = etapaSiguiente(m);
  const toca = etapa && estadoEtapa(m, etapa) === "sin_asignar" ? etapa : null;
  const sigue = siguienteAsignable(m);
  // Con despiece, un anillo por proceso (todas las partes y el mueble completo que lo llevan);
  // sin despiece, uno por paso de su ruta.
  const anillos: { clave: string; estado: EstadoProceso; contenido: ReactNode }[] =
    partesConRuta(m).length > 0
      ? columnasMueble(m).map((c) => ({
          clave: `${c.proceso}-${c.vez}`,
          estado: avanceColumna(m, c).estado,
          contenido: <Columna mueble={m} columna={c} />,
        }))
      : m.ruta.map((p, i) => ({
          clave: p.id ?? `${p.proceso}-${i}`,
          estado: avancePaso(m, i).estado,
          contenido: <Paso mueble={m} indice={i} />,
        }));
  const estiloPildora =
    "rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";
  const estiloAsignar = `${estiloPildora} bg-amber-500 text-white shadow-sm transition-colors hover:bg-amber-600`;

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div
        // Tocar cualquier parte de la fila la abre o la cierra; los botones y enlaces
        // conservan su propia acción (y los diálogos en portal no cuentan).
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (!e.currentTarget.contains(t) || t.closest("a, button, input, select, textarea")) return;
          onAlternar();
        }}
        className="flex cursor-pointer flex-col gap-3 p-3 sm:flex-row sm:items-center"
      >
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
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
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
        ) : asignar && requiereDespiece(m) ? (
          <EnlaceDespiece mueble={m} className={estiloAsignar}>
            Falta despiece →
          </EnlaceDespiece>
        ) : asignar && toca?.tipo === "partes" && sigue ? (
          <BotonAsignar
            mueble={m}
            inicial={{ parte: sigue.parte?.id ?? null, paso: sigue.paso.indice }}
            asignar={asignar}
            className={estiloAsignar}
          >
            + Asignar partes
          </BotonAsignar>
        ) : toca?.tipo === "paso" && porAsignar(m, toca.indice, asignar) ? (
          <BotonAsignar
            mueble={m}
            inicial={{ parte: null, paso: toca.indice }}
            asignar={asignar}
            className={estiloAsignar}
          >
            + Asignar {etiquetaPaso(m.ruta, toca.indice)}
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
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={abierto}
            className="flex min-w-0 max-w-full items-center gap-2 text-left"
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
                {m.cantidad} {m.unidad ?? ""}
                {(m.partes?.length ?? 0) > 0 && (
                  <span
                    className="font-semibold text-slate-700"
                    title="Muebles completos: los que alcanza la parte más atrasada, con lo entregado en el último paso de su ruta"
                  >
                    {" "}
                    · {encuadreMueble(m).completos}/{m.cantidad} completos
                  </span>
                )}
              </span>
            </span>
          </button>
          </div>
        </div>

        <ol className="flex flex-1 items-center overflow-x-auto">
          {anillos.map((a, j) => (
            <li key={a.clave} className="flex flex-1 items-start last:flex-none">
              <button
                type="button"
                onClick={onAlternar}
                className="rounded-lg p-1 transition-colors hover:bg-slate-50"
              >
                {a.contenido}
              </button>
              {j < anillos.length - 1 && (
                // A la altura del centro del círculo (p-1 del botón + mitad de size-16,
                // menos la mitad del grosor), no del paso con su etiqueta.
                <span
                  aria-hidden
                  className="mx-1 mt-[35px] h-0.5 min-w-2 flex-1 rounded-full transition-colors"
                  style={{
                    background: a.estado === "terminado" ? COLOR.terminado : "var(--color-slate-200)",
                  }}
                />
              )}
            </li>
          ))}
        </ol>
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

// Un anillo del flujo: el avance en % con el color de su estado y una etiqueta abajo.
function Anillo({
  estado,
  pct,
  porReasignar,
  etiqueta,
  titulo,
}: {
  estado: EstadoProceso;
  pct: number;
  porReasignar: number;
  etiqueta: string;
  titulo: string;
}) {
  const color = COLOR[estado];
  return (
    <span className="flex flex-col items-center gap-1.5" title={titulo}>
      <span
        className="relative grid size-16 place-items-center rounded-full transition-[background] duration-300"
        style={{
          background:
            estado === "sin_asignar"
              ? "transparent"
              : `conic-gradient(${color} ${pct}%, var(--color-slate-200) 0)`,
          border: estado === "sin_asignar" ? `2px dashed ${color}` : undefined,
        }}
      >
        <span
          className="grid size-[3.25rem] place-items-center rounded-full bg-white text-sm font-bold tabular-nums"
          style={{ color }}
        >
          {estado === "terminado" ? "✓" : `${pct}%`}
        </span>
        {porReasignar > 0 && (
          <span className="absolute -top-1 -left-1 grid size-5 place-items-center rounded-full bg-rose-500 text-xs font-bold leading-none text-white">
            !
          </span>
        )}
      </span>
      <span className="text-xs font-medium leading-tight whitespace-nowrap text-slate-700">{etiqueta}</span>
    </span>
  );
}

// Un paso de la ruta del mueble completo. Solo muestra: se asigna con el botón de la fila
// o desde el detalle.
function Paso({ mueble: m, indice }: { mueble: MuebleFlujo; indice: number }) {
  const a = avancePaso(m, indice);
  const etiqueta = etiquetaPaso(m.ruta, indice);
  const pct = avancePonderado(m, indice);
  return (
    <Anillo
      estado={a.estado}
      pct={pct}
      porReasignar={a.porReasignar}
      etiqueta={etiqueta}
      titulo={`${etiqueta} (mueble completo): ${pct}% · ${a.entregado}/${m.cantidad} entregadas, ${a.asignado} asignadas${
        a.porReasignar > 0 ? `, ${a.porReasignar} rechazadas por Calidad sin reasignar` : ""
      }`}
    />
  );
}

// Un proceso de un mueble con despiece: el avance de todas las partes que lo llevan (cada
// una pesa su % del mueble) y del mueble completo si también lo lleva.
function Columna({ mueble: m, columna: c }: { mueble: MuebleFlujo; columna: ColumnaProceso }) {
  const a = avanceColumna(m, c);
  return (
    <Anillo
      estado={a.estado}
      pct={a.pct}
      porReasignar={a.porReasignar}
      etiqueta={c.etiqueta}
      titulo={`${c.etiqueta}: ${a.pct}% de las partes que lo llevan · ${a.muebles}/${m.cantidad} muebles completos${
        a.porReasignar > 0 ? ` · ${a.porReasignar} rechazadas por Calidad sin reasignar` : ""
      }`}
    />
  );
}

// Una celda de la tabla de rutas: el paso de esa ruta en esa columna, con lo entregado y,
// si se puede, su "+" para asignar ahí. "—" si esa ruta no lleva el proceso.
function CeldaRuta({
  mueble: m,
  parte,
  columna: c,
  asignar,
}: {
  mueble: MuebleFlujo;
  parte: ParteMueble | null;
  columna: ColumnaProceso;
  asignar: AsignarDesdeFlujo | null;
}) {
  const ruta = parte ? parte.ruta : m.ruta;
  const i = pasoEnColumna(ruta, c);
  if (i < 0) {
    return (
      <td className="p-2 text-slate-400" title="No lleva este proceso">
        —
      </td>
    );
  }
  const a = avanceEnRuta(m, i, parte);
  const unidad = parte ? (parte.unidad ?? "pz") : (m.unidad ?? "pz");
  const dueno = parte ? parte.descripcion : "el mueble completo";
  return (
    <td className="p-2 whitespace-nowrap text-slate-600">
      <span className="flex items-center gap-2">
        {/* El "+" a la izquierda: asigna esta ruta en este paso. */}
        {asignar && a.disponible > 0 ? (
          <BotonAsignar
            mueble={m}
            inicial={{ parte: parte?.id ?? null, paso: i }}
            asignar={asignar}
            titulo={`Asignar ${dueno} en ${c.etiqueta} (${fmt(a.disponible)} ${unidad} por asignar)`}
            className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-500 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400"
          >
            +
          </BotonAsignar>
        ) : (
          asignar && <span aria-hidden className="size-6 shrink-0" />
        )}
        <span
          className="font-medium text-slate-900"
          title={`Entregadas / total (${fmt(a.asignado)} asignadas)`}
        >
          {a.estado === "terminado" ? "✓ " : ""}
          {fmt(a.entregado)}/{fmt(a.total)}
          <span className="ml-1 font-normal text-slate-500">{unidad}</span>
        </span>
      </span>
    </td>
  );
}

// Las rutas del mueble al abrirlo, en una tabla: una fila por parte del despiece (en sus
// piezas) y una del mueble completo (en muebles); una columna por proceso. Cada fila tiene
// su "Ruta" para cambiar solo esa ruta. Sin despiece (y con componentes), el aviso para
// hacerlo.
function Rutas({ mueble: m, asignar }: { mueble: MuebleFlujo; asignar: AsignarDesdeFlujo | null }) {
  const partes = m.partes ?? [];
  if (requiereDespiece(m)) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <p>
          Este mueble tiene componentes y no tiene despiece (se hace en el carrito, antes de liberarlo).
          Sin él no se asigna por partes.
        </p>
        {asignar && (
          <EnlaceDespiece mueble={m} className="font-semibold underline">
            Hacer despiece aquí
          </EnlaceDespiece>
        )}
      </div>
    );
  }
  const descripcion = `ítem ${m.item_code}${m.modelo ? ` · ${m.modelo}` : ""}`;
  const botonRuta = (parte: ParteMueble | null) =>
    asignar && (
      <EditarRuta
        itemId={m.id}
        descripcion={descripcion}
        parte={parte ? { id: parte.id, descripcion: parte.descripcion } : undefined}
        conPartes={partes.length > 0}
        ruta={parte ? parte.ruta : m.ruta}
        version={m.versionRuta}
        aplica={m.aplica}
        bloqueados={(parte ? parte.ruta : m.ruta).map((_, i) => pasoConAsignaciones(m, i, parte))}
        titulo={parte ? `Cambiar la ruta de "${parte.descripcion}"` : "Cambiar la ruta del mueble completo"}
      >
        Ruta
      </EditarRuta>
    );

  if (partes.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="font-semibold text-slate-700">
          Ruta: <span className="font-normal text-slate-600">{textoRuta(m.ruta) || "sin pasos"}</span>
        </p>
        {botonRuta(null)}
      </div>
    );
  }
  const columnas = columnasMueble(m);
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-700">
          Despiece ({partes.length} partes){" "}
          <span className="font-normal text-slate-500">· cada parte con su ruta, en sus piezas; asigna con el +</span>
        </p>
        {/* El despiece se hace en el carrito; aquí solo se corrige si hace falta. */}
        {asignar && (
          <EnlaceDespiece mueble={m} className="font-medium text-sky-700 underline">
            Editar despiece
          </EnlaceDespiece>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg bg-white">
        <table className="w-full text-left tabular-nums">
          <thead className="text-slate-500">
            <tr>
              <th className="p-2 font-medium">Parte</th>
              {columnas.map((c) => (
                <th key={`${c.proceso}-${c.vez}`} className="p-2 font-medium whitespace-nowrap">
                  {c.etiqueta}
                </th>
              ))}
              {asignar && <th className="p-2" aria-label="Ruta" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {partes.map((p) => (
              <tr key={p.id}>
                <td className="p-2 text-slate-900">
                  {p.descripcion}
                  <span className="block text-slate-500">
                    {fmt(p.piezasPorMueble)} {p.unidad ?? "pz"} por mueble · {fmt(p.piezasPorMueble * m.cantidad)} en total
                  </span>
                </td>
                {columnas.map((c) => (
                  <CeldaRuta key={`${c.proceso}-${c.vez}`} mueble={m} parte={p} columna={c} asignar={asignar} />
                ))}
                {asignar && <td className="p-2 text-right">{botonRuta(p)}</td>}
              </tr>
            ))}
            <tr className="bg-slate-50/60">
              <td className="p-2 font-semibold text-slate-900">
                Mueble completo
                <span className="block font-normal text-slate-500">
                  {m.ruta.length === 0 ? "sin pasos: termina con sus partes" : "ya armado, después de sus partes"}
                </span>
              </td>
              {columnas.map((c) => (
                <CeldaRuta key={`${c.proceso}-${c.vez}`} mueble={m} parte={null} columna={c} asignar={asignar} />
              ))}
              {asignar && <td className="p-2 text-right">{botonRuta(null)}</td>}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Las asignaciones de un paso, con sus entregas y acciones.
function ListaAsignaciones({
  lista,
  detalles,
}: {
  lista: AsignacionResumen[];
  detalles: Record<string, ReactNode>;
}) {
  if (lista.length === 0) return <p className="text-amber-700">Sin asignar</p>;
  return (
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
                {Number(x.entregado)}/{Number(x.cantidad)} · asig. {formatoFecha(x.fecha_asignacion)}
                {x.ultima_entrega ? ` · entr. ${formatoFecha(x.ultima_entrega)}` : ""}
              </p>
              {(x.folios_calidad || x.folios_cal) && (
                <p className="text-slate-500">{[x.folios_calidad, x.folios_cal].filter(Boolean).join(" · ")}</p>
              )}
            </summary>
            {detalles[x.id] && <div className="border-t border-slate-100 p-2">{detalles[x.id]}</div>}
          </details>
        </li>
      ))}
    </ul>
  );
}

// Un paso con sus asignaciones: del mueble completo (parte null) o de una parte.
function DetallePaso({
  mueble: m,
  parte,
  indice,
  asignar,
  detalles,
}: {
  mueble: MuebleFlujo;
  parte: ParteMueble | null;
  indice: number;
  asignar: AsignarDesdeFlujo | null;
  detalles: Record<string, ReactNode>;
}) {
  const ruta = parte ? parte.ruta : m.ruta;
  const a = avanceEnRuta(m, indice, parte);
  const unidad = parte ? (parte.unidad ?? "pz") : (m.unidad ?? "pz");
  const conAnterior = indice > 0 || (!parte && (m.partes ?? []).some((p) => p.ruta.length > 0));
  return (
    <details open={!parte} className="group flex flex-col gap-1.5 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-xs text-slate-500 transition-transform group-open:rotate-90">
          ▶
        </span>
        <span className="font-semibold text-slate-700">
          {indice + 1}. {etiquetaPaso(ruta, indice)}
          <span className="ml-1 font-normal text-slate-500">
            · {fmt(a.entregado)}/{fmt(a.total)} {unidad}
            {conAnterior && a.disponible > 0 ? ` · ${fmt(a.listo)} listas` : ""}
          </span>
        </span>
      </summary>
      {!parte && porAsignar(m, indice, asignar) && (
        <div className="flex items-center justify-between gap-2">
          <BotonAsignar
            mueble={m}
            inicial={{ parte: null, paso: indice }}
            asignar={asignar}
            className="rounded-md bg-brand-500 px-2 py-0.5 text-xs font-semibold text-on-brand transition-colors hover:bg-brand-400"
          >
            + Asignar ({fmt(a.disponible)})
          </BotonAsignar>
        </div>
      )}
      {a.porReasignar > 0 && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">
          Calidad rechazó {fmt(a.porReasignar)} {unidad} que faltan por reasignar ·{" "}
          <Link href="/produccion/rechazos" className="font-medium underline">
            Rechazado por Calidad
          </Link>
        </p>
      )}
      <ListaAsignaciones lista={asignacionesDelPaso(m, indice, parte)} detalles={detalles} />
    </details>
  );
}

// Un paso de una parte que ya tiene trabajo: su título con lo entregado, lo que Calidad rechazó y sus
// asignaciones. Sin desplegable propio: la parte se abre directo a esto.
function PasoDeParte({
  mueble: m,
  parte,
  indice,
  detalles,
}: {
  mueble: MuebleFlujo;
  parte: ParteMueble;
  indice: number;
  detalles: Record<string, ReactNode>;
}) {
  const a = avanceEnRuta(m, indice, parte);
  const unidad = parte.unidad ?? "pz";
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <p className="font-semibold text-slate-700">
        {etiquetaPaso(parte.ruta, indice)}
        <span className="ml-1 font-normal text-slate-500">
          · {fmt(a.entregado)}/{fmt(a.total)} {unidad}
        </span>
      </p>
      {a.porReasignar > 0 && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">
          Calidad rechazó {fmt(a.porReasignar)} {unidad} que faltan por reasignar ·{" "}
          <Link href="/produccion/rechazos" className="font-medium underline">
            Rechazado por Calidad
          </Link>
        </p>
      )}
      <ListaAsignaciones lista={asignacionesDelPaso(m, indice, parte)} detalles={detalles} />
    </div>
  );
}

// ¿Este paso tiene algo que mostrar (asignaciones o piezas rechazadas por reasignar)? Los pasos sin
// nada ya se ven, con su "+", en la tabla de rutas.
function pasoConTrabajo(m: MuebleFlujo, indice: number, parte: ParteMueble | null): boolean {
  return asignacionesDelPaso(m, indice, parte).length > 0 || avanceEnRuta(m, indice, parte).porReasignar > 0;
}

// Algo en marcha o rechazado: la sección se abre sola.
function pasoEnMarcha(m: MuebleFlujo, indice: number, parte: ParteMueble | null): boolean {
  return (
    avanceEnRuta(m, indice, parte).porReasignar > 0 ||
    asignacionesDelPaso(m, indice, parte).some((x) => x.estado === "en_proceso" || x.estado === "parcial")
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
  const partes = (m.partes ?? []).filter((p) => p.ruta.length > 0);
  // Solo las partes que ya tienen asignaciones, con los pasos que las tienen.
  const partesConTrabajo = partes
    .map((p) => ({ parte: p, pasos: p.ruta.map((_, i) => i).filter((i) => pasoConTrabajo(m, i, p)) }))
    .filter((x) => x.pasos.length > 0);
  const pasosMueble = m.ruta.map((_, i) => i).filter((i) => pasoConTrabajo(m, i, null));
  const abrirPartes = partesConTrabajo.some((x) => x.pasos.some((i) => pasoEnMarcha(m, i, x.parte)));
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 p-3">
      <Rutas mueble={m} asignar={asignar} />
      {partes.length > 0 &&
        (partesConTrabajo.length === 0 ? (
          <p className="text-xs text-slate-500">Aún no hay asignaciones de partes.</p>
        ) : (
          <details open={abrirPartes} className="group/partes flex flex-col gap-2 text-xs">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
              <Chevron abierto={false} className="h-3.5 w-3.5 text-slate-500 group-open/partes:rotate-90" />
              Asignaciones de las partes
              <span className="font-normal text-slate-500">
                ({partesConTrabajo.length} de {partes.length})
              </span>
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {partesConTrabajo.map(({ parte: p, pasos }) => (
                <details
                  key={p.id}
                  open={pasos.some((i) => pasoEnMarcha(m, i, p))}
                  className="group/parte rounded-lg border border-slate-200 bg-white/60 p-2 text-xs"
                >
                  <summary className="flex cursor-pointer list-none items-start gap-1.5 font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
                    <Chevron abierto={false} className="mt-0.5 h-3.5 w-3.5 text-slate-500 group-open/parte:rotate-90" />
                    <span className="min-w-0 flex-1">
                    {p.descripcion}
                    {/* Estado en una línea; la ruta completa está en la tabla de arriba. */}
                    <span className="ml-1 font-normal text-slate-500">
                      ·{" "}
                      {pasos
                        .map((i) => {
                          const a = avanceEnRuta(m, i, p);
                          return `${etiquetaPaso(p.ruta, i)} ${fmt(a.entregado)}/${fmt(a.total)}`;
                        })
                        .join(" · ")}
                    </span>
                    </span>
                  </summary>
                  <div className="mt-2 flex flex-col gap-3">
                    {pasos.map((i) => (
                      <PasoDeParte
                        key={p.ruta[i].id ?? `${p.ruta[i].proceso}-${i}`}
                        mueble={m}
                        parte={p}
                        indice={i}
                        detalles={detalles}
                      />
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
      {pasosMueble.length > 0 && (
        <div className="flex flex-col gap-2">
          {partes.length > 0 && <p className="text-xs font-semibold text-slate-700">Asignaciones del mueble completo</p>}
          <div className="grid gap-3 lg:grid-cols-2">
            {pasosMueble.map((i) => (
              <DetallePaso
                key={m.ruta[i].id ?? `${m.ruta[i].proceso}-${i}`}
                mueble={m}
                parte={null}
                indice={i}
                asignar={asignar}
                detalles={detalles}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
