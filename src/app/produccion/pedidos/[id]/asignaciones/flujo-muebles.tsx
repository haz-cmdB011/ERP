"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Chevron from "@/components/chevron";
import Aparece from "@/components/aparece";
import { usePathname, useSearchParams } from "next/navigation";
import ImagenAmpliable from "@/components/imagen-ampliable";
import {
  ESTADO_ASIGNACION_ESTILOS,
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
    "rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors";
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
    ) : toca?.tipo === "paso" && porAsignar(m, toca.indice, asignar) ? (
      <BotonAsignar
        mueble={m}
        inicial={{ parte: null, paso: toca.indice }}
        asignar={asignar}
        className={`${boton} bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}
      >
        Asignar {etiquetaPaso(m.ruta, toca.indice)}
      </BotonAsignar>
    ) : (
      <span className={`${texto} ${siguiente.startsWith("Asignar") ? "text-amber-700" : "text-slate-500"}`}>
        {siguiente}
      </span>
    );

  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <div
        // Tocar cualquier parte de la fila la abre o la cierra; los botones y enlaces
        // conservan su propia acción (y los diálogos en portal no cuentan).
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (!e.currentTarget.contains(t) || t.closest('a, button, input, select, textarea, [role="dialog"]')) return;
          onAlternar();
        }}
        className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-2.5 sm:grid-cols-[18rem_minmax(0,1fr)_auto] sm:p-3"
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
            <span className="block truncate text-base font-semibold text-slate-900">
              <span className="font-normal text-slate-400 tabular-nums">{m.item_code}</span> {m.modelo ?? "Sin modelo"}
            </span>
            <span className="block text-sm text-slate-500 tabular-nums">
              {m.cantidad} {m.unidad ?? ""}
              {partesConRuta(m).length > 0 && (
                <span
                  className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                  title={`Se empezó por partes; lo nuevo va al mueble completo. Muebles completos hasta ahora: ${encuadreMueble(m).completos} de ${m.cantidad}.`}
                >
                  Por partes
                </span>
              )}
            </span>
          </button>
        </div>

        {/* La ruta: en celular baja a su propia línea, debajo del nombre. */}
        <ol className="col-span-2 row-start-2 flex items-start overflow-x-auto sm:col-span-1 sm:col-start-2 sm:row-start-1">
          {anillos.map((a, j) => (
            <li key={a.clave} className="flex flex-1 items-start last:flex-none">
              <button
                type="button"
                onClick={onAlternar}
                className="rounded-lg px-1 transition-colors hover:bg-slate-50"
              >
                {a.contenido}
              </button>
              {j < anillos.length - 1 && (
                // A la altura del centro del círculo (mitad de size-10, menos la mitad del grosor).
                <span
                  aria-hidden
                  className="mx-0.5 mt-[19px] h-0.5 min-w-3 flex-1 rounded-full transition-colors"
                  style={{
                    background: a.estado === "terminado" ? COLOR.terminado : "var(--color-slate-200)",
                  }}
                />
              )}
            </li>
          ))}
        </ol>

        <div className="col-start-2 row-start-1 justify-self-end sm:col-start-3">{accion}</div>
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
      <span className="text-[11px] font-medium leading-tight whitespace-nowrap text-slate-600">{etiqueta}</span>
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
            className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-500 text-sm sm:size-7 sm:text-base font-bold text-on-brand transition-colors hover:bg-brand-400"
          >
            +
          </BotonAsignar>
        ) : (
          asignar && <span aria-hidden className="size-6 shrink-0 sm:size-7" />
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
      {verPartes && <DespieceMateriales mueble={m} />}
    </div>
  );
}

// Las partes del despiece: de qué está hecha cada una (icono y color de su material) y cuántas
// piezas lleva.
function DespieceMateriales({ mueble: m }: { mueble: MuebleFlujo }) {
  const partes = m.partes ?? [];
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
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-700">
          Despiece ({partes.length} partes)
        </p>
        {asignar && (
          <EnlaceDespiece mueble={m} className="font-medium text-sky-700 underline">
            Editar despiece
          </EnlaceDespiece>
        )}
      </div>
      <p className="text-slate-500">
        Este mueble se empezó por partes: lo que ya tienen sus partes se sigue entregando aquí. Lo nuevo se
        asigna al mueble completo.
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
                    </span>
                  </span>
                </td>
                {columnas.map((c) => (
                  // Las partes solo se consultan: sin "+".
                  <CeldaRuta key={`${c.proceso}-${c.vez}`} mueble={m} parte={p} columna={c} asignar={null} />
                ))}
                {asignar && <td className="p-1 sm:p-2" />}
              </tr>
            ))}
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
  if (lista.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {lista.map((x) => {
        // Lo que sigue en taller se abre solo (registrar entrega); lo entregado o cancelado, no.
        const activa = x.estado === "en_proceso" || x.estado === "parcial";
        const fechas =
          x.ultima_entrega && x.ultima_entrega !== x.fecha_asignacion
            ? `${formatoFecha(x.fecha_asignacion)} → ${formatoFecha(x.ultima_entrega)}`
            : formatoFecha(x.fecha_asignacion);
        return (
          <li key={x.id}>
            <details open={activa} className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 [&::-webkit-details-marker]:hidden">
                <Chevron abierto={false} className="h-3.5 w-3.5 text-slate-400 group-open:rotate-90" />
                <span className="font-medium text-slate-900">
                  {x.equipo}
                  {x.encargado ? <span className="font-normal text-slate-500"> · {x.encargado}</span> : null}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${ESTADO_ASIGNACION_ESTILOS[x.estado]}`}>
                  {ESTADO_ASIGNACION_LABELS[x.estado]}
                </span>
                {(x.folio_rechazo || x.folio_revision_final) && (
                  <span className="text-xs text-rose-700">Retrabajo{x.folio_revision_final ? ` ${x.folio_revision_final}` : ""}</span>
                )}
                {x.adelantada && (
                  <span
                    className="text-xs text-amber-700"
                    title="Se asignó antes de que el paso anterior entregara esas piezas"
                  >
                    Adelantada
                  </span>
                )}
                <span className="ml-auto text-slate-500 tabular-nums">
                  <span className="font-semibold text-slate-900">
                    {Number(x.entregado)}/{Number(x.cantidad)}
                  </span>{" "}
                  · {fechas}
                </span>
              </summary>
              {detalles[x.id] && <div className="border-t border-slate-100 px-3 py-2">{detalles[x.id]}</div>}
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
  return (
    <section className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center gap-3">
        <h4 className="font-semibold text-slate-800">{etiquetaPaso(ruta, indice)}</h4>
        {a.porReasignar > 0 && (
          <Link href="/produccion/rechazos" className="text-xs font-medium text-rose-700 hover:underline">
            {fmt(a.porReasignar)} {unidad} rechazadas por reasignar
          </Link>
        )}
        {!parte && porAsignar(m, indice, asignar) && (
          <BotonAsignar
            mueble={m}
            inicial={{ parte: null, paso: indice }}
            asignar={asignar}
            className="ml-auto text-sm font-medium text-sky-700 hover:underline"
          >
            Asignar {fmt(a.disponible)} más
          </BotonAsignar>
        )}
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
      <Rutas mueble={m} asignar={asignar} />
      {pasosMueble.length === 0 && partes.length === 0 && !requiereDespiece(m) && (
        <p className="text-sm text-slate-500">Sin asignaciones todavía.</p>
      )}
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
