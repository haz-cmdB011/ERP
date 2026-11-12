"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Chevron from "@/components/chevron";
import Aparece from "@/components/aparece";
import { usePathname, useSearchParams } from "next/navigation";
import ImagenAmpliable from "@/components/imagen-ampliable";
import {
  ESTADO_ASIGNACION_LABELS,
  formatoFecha,
  type AsignacionResumen,
  type EncargadoEquipo,
  type EquipoProduccion,
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
  siguienteAsignable,
  pasoConAsignaciones,
  pasoEnColumna,
  requiereDespiece,
  siguientePaso,
  type ColumnaProceso,
  type EstadoMueble,
  type EstadoProceso,
  type MuebleFlujo,
  type ParteMueble,
} from "@/lib/produccion/flujo-mueble";
import { etiquetaPaso } from "@/lib/produccion/ruta";
import { tipoMaterial, type TipoMaterial } from "@/lib/produccion/despiece";
import { COLORES_MATERIAL, InsigniaMaterial } from "@/app/produccion/material-parte";
import AsignarForm from "@/app/produccion/asignaciones/asignar-form";
import EditarRuta from "./editar-ruta";
import AsignarPorPartes from "./asignar-por-partes";
import PasaPorParte from "./pasa-por-parte";
import type { Proceso } from "@/lib/produccion/asignaciones";

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
  marcado = false,
}: {
  mueble: MuebleFlujo;
  asignar: AsignarDesdeFlujo | null;
  detalles: Record<string, ReactNode>;
  abierto: boolean;
  onAlternar: () => void;
  // El mueble con el que se estaba trabajando (el panel lo recuerda al ir a un PM y volver): se
  // distingue con un borde más marcado.
  marcado?: boolean;
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
  // El primer paso (o parte, si va por partes) que todavía tiene lugar para asignar. Aunque el
  // paso actual siga en taller, se puede asignar el siguiente (queda "adelantada").
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
  // Lo que sigue, a la derecha: el botón para asignar o, si no hay nada que hacer aquí, en qué va.
  const boton =
    "block max-w-[8.5rem] rounded-lg px-3 py-2 text-center text-sm leading-tight font-semibold transition-colors @md:max-w-none @md:whitespace-nowrap";
  const texto = "text-sm font-medium whitespace-nowrap";
  const accion =
    terminado && obra === "en_revision_final" ? (
      <span className={`${texto} text-sky-700`} title="Toda la ruta está terminada; falta la revisión final de Calidad">
        Revisión final {m.revisionFinal?.aprobadas ?? 0}/{m.cantidad}
      </span>
    ) : terminado ? (
      <span className={`${texto} text-emerald-700`}>{obra === "liberado" ? "Liberado a obra" : "Terminado"}</span>
    ) : asignar && requiereDespiece(m) ? (
      <EnlaceDespiece mueble={m} className={`${boton} border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}>
        Hacer despiece
      </EnlaceDespiece>
    ) : asignar && m.porPartes && toca?.tipo === "partes" && sigue?.parte ? (
      <BotonAsignar
        mueble={m}
        inicial={{ parte: sigue.parte?.id ?? null, paso: sigue.paso.indice }}
        asignar={asignar}
        className={`${boton} bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}
      >
        Asignar
      </BotonAsignar>
    ) : toca?.tipo === "paso" && porAsignar(m, toca.indice, asignar) ? (
      <BotonAsignar
        mueble={m}
        inicial={{ parte: null, paso: toca.indice }}
        asignar={asignar}
        className={`${boton} bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}
      >
        Asignar
      </BotonAsignar>
    ) : asignar && sigue ? (
      // Lo actual ya está en taller: se dice en qué va y se ofrece asignar lo que sigue.
      <span className="flex flex-col items-end gap-1">
        <BotonAsignar
          mueble={m}
          inicial={{ parte: sigue.parte?.id ?? null, paso: sigue.paso.indice }}
          asignar={asignar}
          className={`${boton} border border-brand-500 text-slate-900 hover:bg-brand-50`}
        >
          Asignar
        </BotonAsignar>
        <span className="text-xs text-slate-500">{siguiente}</span>
      </span>
    ) : (
      <span className={`${texto} ${siguiente.startsWith("Asignar") ? "text-amber-700" : "text-slate-500"}`}>
        {siguiente}
      </span>
    );

  // Sin barra de desplazamiento: según el ancho de la tarjeta (no de la pantalla), la ruta va
  // entre el nombre y el botón o, si no cabe, en su propio renglón a todo lo ancho. Una ruta
  // larga necesita una tarjeta más ancha para ir en línea.
  const enLinea = anillos.length <= 4 ? "@3xl" : anillos.length <= 6 ? "@5xl" : "@7xl";
  const columnas = {
    "@3xl": "@3xl:grid-cols-[minmax(9rem,16rem)_minmax(0,1fr)_auto] @3xl:col-span-1 @3xl:col-start-2 @3xl:row-start-1 @3xl:col-start-3",
    "@5xl": "@5xl:grid-cols-[minmax(9rem,16rem)_minmax(0,1fr)_auto] @5xl:col-span-1 @5xl:col-start-2 @5xl:row-start-1 @5xl:col-start-3",
    "@7xl": "@7xl:grid-cols-[minmax(9rem,16rem)_minmax(0,1fr)_auto] @7xl:col-span-1 @7xl:col-start-2 @7xl:row-start-1 @7xl:col-start-3",
  }[enLinea].split(" ");
  return (
    <li
      data-mueble-id={m.id}
      aria-current={marcado ? "true" : undefined}
      className={`@container scroll-mt-28 rounded-xl border bg-white transition-colors motion-reduce:transition-none ${
        marcado ? "border-slate-900 ring-1 ring-slate-900/10" : "border-slate-200"
      }`}
    >
      <div
        // Tocar cualquier parte de la fila la abre o la cierra; los botones y enlaces
        // conservan su propia acción (y los diálogos en portal no cuentan).
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (!e.currentTarget.contains(t) || t.closest('a, button, input, select, textarea, [role="dialog"]')) return;
          onAlternar();
        }}
        className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 p-2.5 sm:p-3 ${columnas[0]}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          {imagen ? (
            <ImagenAmpliable
              url={imagen.url}
              urlGrande={imagen.urlGrande}
              alt={`Ítem ${m.item_code}${m.modelo ? ` — ${m.modelo}` : ""}`}
              className="h-11 w-11"
            />
          ) : (
            imagen === null && (
              <span className="block h-11 w-11 shrink-0 rounded-md bg-slate-100" title="Sin imagen" />
            )
          )}
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={abierto}
            className="min-w-0 text-left"
          >
            {/* Hasta dos renglones: en celular el botón de la derecha deja poco ancho y el modelo se cortaba. */}
            <span className="line-clamp-2 break-words text-base font-semibold leading-snug text-slate-900">
              <span className="font-normal text-slate-400 tabular-nums">{m.item_code}</span> {m.modelo ?? "Sin modelo"}
            </span>
            <span className="block text-sm text-slate-500 tabular-nums">
              {m.cantidad} {m.unidad ?? ""}
              {partesConRuta(m).length > 0 && (
                <span
                  className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                  title={`${m.porPartes ? "Se asigna por partes." : "Se empezó por partes; lo nuevo va al mueble completo."} Muebles completos hasta ahora: ${encuadreMueble(m).completos} de ${m.cantidad}.`}
                >
                  Por partes
                </span>
              )}
            </span>
          </button>
        </div>

        {/* La ruta: en celular baja a su propia línea, debajo del nombre. Si la ruta es larga (cinco
            pasos o más) se desliza de lado en vez de salirse de la tarjeta; el pt-1 deja ver el "!" de
            los rechazos, que asoma por arriba del anillo. */}
        <ol
          className={`col-span-2 row-start-2 -mt-1 -ml-1 flex min-w-0 items-start overflow-x-auto pt-1 pl-1 ${columnas[1]} ${columnas[2]} ${columnas[3]}`}
        >
          {anillos.map((a, j) => (
            <li key={a.clave} className="flex flex-1 items-start last:flex-none">
              <button
                type="button"
                onClick={onAlternar}
                // Ancho fijo: con nombres largos (Superficie Sólida) las líneas entre anillos no se acortan.
                className="w-[4.75rem] shrink-0 rounded-lg px-0.5 transition-colors hover:bg-slate-50"
              >
                {a.contenido}
              </button>
              {j < anillos.length - 1 && (
                // A la altura del centro del círculo (mitad de size-10, menos la mitad del grosor).
                <span
                  aria-hidden
                  className="mt-[19px] h-0.5 min-w-1 flex-1 rounded-full transition-colors sm:mx-0.5 sm:min-w-2"
                  style={{
                    background: a.estado === "terminado" ? COLOR.terminado : "var(--color-slate-200)",
                  }}
                />
              )}
            </li>
          ))}
        </ol>

        <div className={`col-start-2 row-start-1 justify-self-end ${columnas[4]}`}>{accion}</div>
      </div>

      <Aparece abierto={abierto}>
        <DetalleMueble
          mueble={m}
          asignar={asignar}
          detalles={detalles}
        />
      </Aparece>
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
    <span className="flex flex-col items-center gap-1" title={titulo}>
      <span
        className="relative grid size-10 place-items-center rounded-full transition-[background] duration-300"
        style={{
          background:
            estado === "sin_asignar"
              ? "transparent"
              : `conic-gradient(${color} ${pct}%, var(--color-slate-200) 0)`,
          border: estado === "sin_asignar" ? `2px dashed ${color}` : undefined,
        }}
      >
        <span
          className="grid size-[2.125rem] place-items-center rounded-full bg-white text-[11px] font-bold tabular-nums"
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
      <span className="text-center text-[11px] font-medium leading-tight text-balance text-slate-600">{etiqueta}</span>
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
      <td className="p-1.5 sm:p-2 text-slate-400" title="No lleva este proceso">
        —
      </td>
    );
  }
  const a = avanceEnRuta(m, i, parte);
  const unidad = parte ? (parte.unidad ?? "pz") : (m.unidad ?? "pz");
  const dueno = parte ? parte.descripcion : "el mueble completo";
  return (
    <td className="p-1.5 sm:p-2 whitespace-nowrap text-slate-600">
      <span className="flex items-center gap-1 sm:gap-2">
        {/* El "+" a la izquierda: asigna esta ruta en este paso. */}
        {asignar && a.disponible > 0 ? (
          <BotonAsignar
            mueble={m}
            inicial={{ parte: parte?.id ?? null, paso: i }}
            asignar={asignar}
            titulo={`Asignar ${dueno} en ${c.etiqueta} (${fmt(a.disponible)} ${unidad} por asignar)`}
            className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-500 text-sm sm:size-7 sm:text-base font-bold text-on-brand transition-colors hover:bg-brand-400 pointer-coarse:size-10"
          >
            +
          </BotonAsignar>
        ) : (
          asignar && <span aria-hidden className="size-6 shrink-0 sm:size-7 pointer-coarse:size-10" />
        )}
        <span
          className="text-xs font-medium text-slate-900 sm:text-sm"
          title={`Entregadas / total (${fmt(a.asignado)} asignadas)`}
        >
          {a.estado === "terminado" ? "✓ " : ""}
          {fmt(a.entregado)}/{fmt(a.total)}
          <span className="ml-1 hidden font-normal text-slate-500 sm:inline">{unidad}</span>
        </span>
      </span>
    </td>
  );
}

// El pie del detalle: el despiece resumido por material (al tocarlo, la lista de partes) y
// los cambios que se hacen de vez en cuando (ruta, despiece). Las partes ya no se asignan
// aparte: el mueble va completo.
function PieMueble({ mueble: m, asignar }: { mueble: MuebleFlujo; asignar: AsignarDesdeFlujo | null }) {
  const [verPartes, setVerPartes] = useState(false);
  const partes = m.partes ?? [];
  const deAntes = partesConRuta(m).length > 0;
  // Cuántas partes hay de cada material, en el orden en que aparecen.
  const porMaterial = new Map<TipoMaterial, number>();
  for (const p of partes) {
    const t = tipoMaterial(p.material, p.descripcion);
    porMaterial.set(t, (porMaterial.get(t) ?? 0) + 1);
  }
  const enlace = "text-sm font-medium text-sky-700 hover:underline";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {partes.length > 0 && !deAntes && (
          <button
            type="button"
            onClick={() => setVerPartes((v) => !v)}
            aria-expanded={verPartes}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg py-1 pr-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Chevron abierto={verPartes} className="h-3.5 w-3.5 text-slate-400" />
            {[...porMaterial].map(([t, n]) => (
              <span key={t} className="flex items-center gap-1.5">
                <InsigniaMaterial tipo={t} tamano="sm" />
                <span className="tabular-nums">
                  {COLORES_MATERIAL[t].etiqueta} ×{n}
                </span>
              </span>
            ))}
          </button>
        )}
        {asignar && (
          <span className="ml-auto flex items-center gap-4">
            {!deAntes && (
              <EditarRuta
                itemId={m.id}
                descripcion={`ítem ${m.item_code}${m.modelo ? ` · ${m.modelo}` : ""}`}
                ruta={m.ruta}
                version={m.versionRuta}
                aplica={m.aplica}
                bloqueados={m.ruta.map((_, i) => pasoConAsignaciones(m, i))}
                titulo="Cambiar los procesos del mueble y su orden"
                className={enlace}
              >
                Cambiar ruta
              </EditarRuta>
            )}
            {partes.length > 0 && (
              <EnlaceDespiece mueble={m} className={enlace}>
                Editar despiece
              </EnlaceDespiece>
            )}
          </span>
        )}
      </div>
      {verPartes && <DespieceMateriales mueble={m} editable={!!asignar} />}
    </div>
  );
}

// Cómo se asigna y entrega un mueble con despiece: completo (una ruta) o por componentes
// (cada parte con su ruta, en sus piezas). Cambiar abre la confirmación de AsignarPorPartes.
function ModoAsignacion({ mueble: m }: { mueble: MuebleFlujo }) {
  const descripcion = `ítem ${m.item_code}${m.modelo ? ` · ${m.modelo}` : ""}`;
  const base = "rounded-md px-3 py-1 text-sm font-medium transition-colors";
  const activo = `${base} bg-white text-slate-900 shadow-sm`;
  const inactivo = `${base} text-slate-500 hover:text-slate-800`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
        {m.porPartes ? (
          <AsignarPorPartes itemId={m.id} descripcion={descripcion} version={m.versionRuta} activar={false} className={inactivo}>
            Mueble completo
          </AsignarPorPartes>
        ) : (
          <span aria-current="true" className={activo}>Mueble completo</span>
        )}
        {m.porPartes ? (
          <span aria-current="true" className={activo}>Por componentes</span>
        ) : (
          <AsignarPorPartes itemId={m.id} descripcion={descripcion} version={m.versionRuta} activar className={inactivo}>
            Por componentes
          </AsignarPorPartes>
        )}
      </div>
    </div>
  );
}

// Las partes del despiece: de qué está hecha cada una (icono y color de su material) y cuántas
// piezas lleva.
function DespieceMateriales({ mueble: m, editable }: { mueble: MuebleFlujo; editable: boolean }) {
  const partes = m.partes ?? [];
  // Lo que se puede elegir en "Pasa por": los procesos de la ruta del mueble, sin repetir.
  const procesosRuta = [...new Set(m.ruta.map((p) => p.proceso))] as Proceso[];
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {partes.map((p) => {
          const tipo = tipoMaterial(p.material, p.descripcion);
          return (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-lg border bg-white px-2 py-1.5"
              style={{ borderColor: `${COLORES_MATERIAL[tipo].colores[0]}55` }}
            >
              <InsigniaMaterial tipo={tipo} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900" title={p.descripcion}>
                  {p.descripcion}
                </span>
                <span className="block text-slate-500 tabular-nums">
                  {COLORES_MATERIAL[tipo].etiqueta} · {fmt(p.piezasPorMueble)} {p.unidad ?? "pz"} por mueble ·{" "}
                  {fmt(p.piezasPorMueble * m.cantidad)} en total
                </span>
                <span className="mt-1 block">
                  {/* Por componentes, la parte ya tiene su ruta: aquí solo se consulta. */}
                  <PasaPorParte
                    itemId={m.id}
                    parteId={p.id}
                    procesos={m.porPartes ? ([...new Set(p.ruta.map((x) => x.proceso))] as Proceso[]) : procesosRuta}
                    omitidos={m.porPartes ? [] : (p.omitidos ?? [])}
                    editable={editable && !m.porPartes}
                  />
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// La ruta del mueble al abrirlo, con su "Ruta" para cambiarla, y su despiece como consulta.
// Un mueble de antes que ya trabajaba por partes conserva la tabla de rutas (una fila por
// parte con ruta y una del mueble completo, una columna por proceso): lo de sus partes solo
// se consulta y entrega; lo nuevo se asigna al mueble completo. Sin despiece (y con
// componentes), el aviso para hacerlo.
function Rutas({ mueble: m, asignar }: { mueble: MuebleFlujo; asignar: AsignarDesdeFlujo | null }) {
  const partes = m.partes ?? [];
  const deAntes = partesConRuta(m).length > 0;
  if (requiereDespiece(m)) {
    return (
      <p className="text-sm text-amber-800">
        Tiene componentes y le falta su despiece; sin él no se asigna.
      </p>
    );
  }
  const descripcion = `ítem ${m.item_code}${m.modelo ? ` · ${m.modelo}` : ""}`;
  const botonRuta = (parte: ParteMueble | null) =>
    asignar && (
      <EditarRuta
        itemId={m.id}
        descripcion={descripcion}
        parte={parte ? { id: parte.id, descripcion: parte.descripcion } : undefined}
        conPartes={deAntes}
        ruta={parte ? parte.ruta : m.ruta}
        version={m.versionRuta}
        aplica={m.aplica}
        bloqueados={(parte ? parte.ruta : m.ruta).map((_, i) => pasoConAsignaciones(m, i, parte))}
        titulo="Cambiar la ruta del mueble"
      >
        Ruta
      </EditarRuta>
    );

  // Lo nuevo no lleva tabla: la ruta ya se ve en los anillos y el despiece va al pie del detalle.
  if (!deAntes) return null;
  const columnas = columnasMueble(m);
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <p className="font-semibold text-slate-700">Despiece ({partes.length} partes)</p>
      <p className="text-slate-500">
        {m.porPartes
          ? "Cada parte se asigna y entrega en sus piezas; el mueble cuenta completo cuando termina la más atrasada."
          : "Este mueble se empezó por partes: lo que ya tienen sus partes se sigue entregando aquí. Lo nuevo se asigna al mueble completo."}
      </p>
      <div className="overflow-x-auto rounded-lg bg-white">
        <table className="w-full text-left text-[11px] tabular-nums sm:text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="p-1.5 sm:p-2 font-medium">Parte</th>
              {columnas.map((c) => (
                <th key={`${c.proceso}-${c.vez}`} className="p-1.5 sm:p-2 font-medium whitespace-nowrap">
                  {c.etiqueta}
                </th>
              ))}
              {asignar && <th className="p-1.5 sm:p-2" aria-label="Ruta" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {partes.map((p) => (
              <tr key={p.id}>
                <td className="p-1.5 sm:p-2 text-slate-900">
                  <span className="flex items-start gap-2">
                    <InsigniaMaterial tipo={tipoMaterial(p.material, p.descripcion)} tamano="sm" />
                    <span>
                      {p.descripcion}
                      <span className="block text-slate-500">
                        {fmt(p.piezasPorMueble)} {p.unidad ?? "pz"} por mueble · {fmt(p.piezasPorMueble * m.cantidad)} en total
                      </span>
                      {m.porPartes && p.ruta.length === 0 && (
                        <span className="block text-amber-700">Sin procesos: agrégale su ruta para poder asignarla.</span>
                      )}
                    </span>
                  </span>
                </td>
                {columnas.map((c) => (
                  // Las partes solo se consultan (sin "+") salvo que el mueble vaya por partes.
                  <CeldaRuta
                    key={`${c.proceso}-${c.vez}`}
                    mueble={m}
                    parte={p}
                    columna={c}
                    asignar={m.porPartes ? asignar : null}
                  />
                ))}
                {asignar && <td className="p-1 text-right sm:p-2">{m.porPartes && botonRuta(p)}</td>}
              </tr>
            ))}
            {/* Por partes y sin pasos propios, el mueble completo no tiene nada que asignar. */}
            {!(m.porPartes && m.ruta.length === 0) && (
            <tr className="bg-slate-50/60">
              <td className="p-1.5 sm:p-2 font-semibold text-slate-900">
                Mueble completo
                <span className="block font-normal text-slate-500">
                  {m.ruta.length === 0 ? "sin pasos: termina con sus partes" : "ya armado, después de sus partes"}
                </span>
              </td>
              {columnas.map((c) => (
                <CeldaRuta key={`${c.proceso}-${c.vez}`} mueble={m} parte={null} columna={c} asignar={asignar} />
              ))}
              {asignar && <td className="p-1 text-right sm:p-2">{botonRuta(null)}</td>}
            </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Cómo se escribe el estado de una asignación: un punto de color y su nombre, sin cajita.
const ESTADO_ASIGNACION_PUNTO: Record<AsignacionResumen["estado"], { punto: string; texto: string }> = {
  en_proceso: { punto: "bg-sky-500", texto: "text-sky-700" },
  parcial: { punto: "bg-sky-500", texto: "text-sky-700" },
  entregada: { punto: "bg-emerald-500", texto: "text-emerald-700" },
  cancelada: { punto: "bg-slate-300", texto: "text-slate-500" },
};

// Las asignaciones de un paso, una por línea: quién la tiene, cómo va y cuándo; al abrirla, sus
// entregas y acciones. Plana, sin cajas dentro de cajas.
function ListaAsignaciones({
  lista,
  detalles,
}: {
  lista: AsignacionResumen[];
  detalles: Record<string, ReactNode>;
}) {
  if (lista.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-slate-100 border-y border-slate-100">
      {lista.map((x) => {
        // Lo que sigue en taller se abre solo (registrar entrega); lo entregado o cancelado, no.
        const activa = x.estado === "en_proceso" || x.estado === "parcial";
        const cancelada = x.estado === "cancelada";
        const estado = ESTADO_ASIGNACION_PUNTO[x.estado];
        const fechas =
          x.ultima_entrega && x.ultima_entrega !== x.fecha_asignacion
            ? `${formatoFecha(x.fecha_asignacion)} a ${formatoFecha(x.ultima_entrega)}`
            : formatoFecha(x.fecha_asignacion);
        return (
          <li key={x.id}>
            <details open={activa} className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5 [&::-webkit-details-marker]:hidden">
                <Chevron abierto={false} className="h-3.5 w-3.5 shrink-0 text-slate-400 group-open:rotate-90" />
                <span className={cancelada ? "font-medium text-slate-500" : activa ? "font-semibold text-slate-900" : "font-medium text-slate-700"}>
                  {x.equipo}
                  {x.encargado ? <span className="font-normal text-slate-500"> · {x.encargado}</span> : null}
                </span>
                <span className={`inline-flex items-center gap-1.5 ${estado.texto} ${activa ? "font-medium" : ""}`}>
                  <span aria-hidden="true" className={`size-1.5 rounded-full ${estado.punto}`} />
                  {ESTADO_ASIGNACION_LABELS[x.estado]}
                </span>
                {(x.folio_rechazo || x.folio_revision_final) && (
                  <span className="text-rose-700">Retrabajo{x.folio_revision_final ? ` ${x.folio_revision_final}` : ""}</span>
                )}
                {x.adelantada && (
                  <span
                    className="text-amber-700"
                    title="Se asignó antes de que el paso anterior entregara esas piezas"
                  >
                    Adelantada
                  </span>
                )}
                <span className="ml-auto flex items-baseline gap-3 tabular-nums">
                  {/* Con una sola asignación, su cantidad ya es la del encabezado del proceso. */}
                  {!cancelada && lista.length > 1 && (
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-900">{Number(x.entregado)}</span> de {Number(x.cantidad)}
                    </span>
                  )}
                  <span className="text-slate-500">{fechas}</span>
                </span>
              </summary>
              {detalles[x.id] && <div className="pb-3 pl-6">{detalles[x.id]}</div>}
            </details>
          </li>
        );
      })}
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
  // El peso visual va a lo que pide atención: el proceso en marcha (o con piezas rechazadas) lleva una
  // marca de color al margen y un título más grande; el ya terminado se apaga y deja ver el siguiente.
  const enMarcha = pasoEnMarcha(m, indice, parte);
  const terminado = a.estado === "terminado";
  const pct = a.total > 0 ? Math.min(100, Math.max(0, Math.round((100 * a.entregado) / a.total))) : 0;
  return (
    <section className="relative flex flex-col gap-2 text-sm">
      {enMarcha && <span aria-hidden="true" className="absolute -left-2.5 bottom-0 top-0 w-0.5 rounded-full bg-sky-500" />}
      {/* El proceso, lo que lleva entregado y, si queda algo, el enlace para asignarlo. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h4
          className={`flex items-center gap-1.5 ${
            enMarcha
              ? "text-lg font-semibold text-slate-900"
              : terminado
                ? "text-base font-medium text-slate-500"
                : "text-base font-medium text-slate-900"
          }`}
        >
          {terminado && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-emerald-600" aria-label="Terminado">
              <path d="m5 12 5 5 9-10" />
            </svg>
          )}
          {etiquetaPaso(ruta, indice)}
        </h4>
        {a.porReasignar > 0 && (
          <Link href="/produccion/rechazos" className="font-semibold text-rose-700 hover:underline">
            {fmt(a.porReasignar)} {unidad} rechazadas por reasignar
          </Link>
        )}
        <span className="ml-auto flex items-center gap-4 tabular-nums text-slate-500">
          {!parte && porAsignar(m, indice, asignar) && (
            <BotonAsignar
              mueble={m}
              inicial={{ parte: null, paso: indice }}
              asignar={asignar}
              className="font-medium text-sky-700 hover:underline"
            >
              Asignar {fmt(a.disponible)} más
            </BotonAsignar>
          )}
          {/* Lo entregado, en grande, con una barra corta: es lo que se mira en cada proceso. */}
          <span className="flex items-center gap-2.5">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
              <span
                className="block h-full rounded-full"
                style={{ width: `${pct}%`, background: terminado ? COLOR.terminado : COLOR.en_proceso }}
              />
            </span>
            <span className={terminado ? "text-slate-500" : "text-slate-600"}>
              <span className={`text-base font-semibold ${terminado ? "text-slate-600" : "text-slate-900"}`}>{fmt(a.entregado)}</span>{" "}
              de {fmt(a.total)} {unidad}
            </span>
          </span>
        </span>
      </div>
      <ListaAsignaciones lista={asignacionesDelPaso(m, indice, parte)} detalles={detalles} />
    </section>
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
    <div className="flex flex-col gap-4 border-t border-slate-100 p-3 sm:px-4">
      {/* Lo primero que se decide: cómo se asigna y entrega. */}
      {asignar && (m.partes ?? []).length > 0 && (partesConRuta(m).length === 0 || m.porPartes) && (
        <ModoAsignacion mueble={m} />
      )}
      <Rutas mueble={m} asignar={asignar} />
      {pasosMueble.length === 0 && partes.length === 0 && !requiereDespiece(m) && (
        <p className="text-sm text-slate-500">Sin asignaciones todavía.</p>
      )}
      {partes.length > 0 &&
        (partesConTrabajo.length === 0 ? null : (
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
          <div className="flex flex-col gap-4">
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
      <PieMueble mueble={m} asignar={asignar} />
    </div>
  );
}
