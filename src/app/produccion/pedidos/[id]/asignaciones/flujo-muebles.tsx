"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import ImagenAmpliable from "@/components/imagen-ampliable";
import {
  ESTADO_ASIGNACION_ESTILOS,
  ESTADO_ASIGNACION_LABELS,
  PROCESO_LABELS,
  formatoFecha,
  mensajeErrorRpc,
  type EncargadoEquipo,
  type EquipoProduccion,
  type Proceso,
} from "@/lib/produccion/asignaciones";
import {
  asignacionesDelPaso,
  avancePaso,
  avancePonderado,
  encuadreMueble,
  estadoMueble,
  estadoObra,
  indiceSiguiente,
  opcionesDePasos,
  parteLleva,
  porcentaje,
  requiereDespiece,
  siguientePaso,
  totalesProceso,
  type EstadoMueble,
  type EstadoProceso,
  type MuebleFlujo,
  type ParteMueble,
} from "@/lib/produccion/flujo-mueble";
import { ORDEN_SUGERIDO, etiquetaPaso } from "@/lib/produccion/ruta";
import AsignarForm from "@/app/produccion/asignaciones/asignar-form";

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
  parte,
  asignar,
  className,
  titulo,
  children,
}: {
  mueble: MuebleFlujo;
  indice: number;
  // La parte del despiece que se asigna (desde su celda de la tabla).
  parte?: string;
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
      conComponentes={m.conComponentes}
      pasoInicial={indice}
      parteInicial={parte}
      className={className}
      titulo={titulo}
    >
      {children}
    </AsignarForm>
  );
}

// Se asigna por partes de su despiece: tiene componentes (o ya tiene partes).
const porPartes = (m: MuebleFlujo) => !!m.conComponentes || (m.partes?.length ?? 0) > 0;

function porAsignar(
  m: MuebleFlujo,
  indice: number,
  asignar: AsignarDesdeFlujo | null,
): asignar is AsignarDesdeFlujo {
  // Con componentes se asigna por partes, desde la tabla del despiece.
  return !!asignar && !porPartes(m) && avancePaso(m, indice).disponible > 0;
}

// Enlace al despiece del mueble (o solo el texto si la pantalla no sabe dónde está).
function EnlaceDespiece({ mueble: m, className, children }: { mueble: MuebleFlujo; className: string; children: ReactNode }) {
  return m.despieceHref ? (
    <Link href={m.despieceHref} className={className}>
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
  // El paso que toca asignar (para el botón de la derecha).
  const i = indiceSiguiente(m);
  const indiceAsignar = i !== null && avancePaso(m, i).estado === "sin_asignar" ? i : null;
  const estiloPildora =
    "rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

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
          <EnlaceDespiece
            mueble={m}
            className={`${estiloPildora} bg-amber-500 text-white shadow-sm transition-colors hover:bg-amber-600`}
          >
            Hacer despiece →
          </EnlaceDespiece>
        ) : asignar && porPartes(m) && indiceAsignar !== null ? (
          <button
            type="button"
            onClick={() => !abierto && onAlternar()}
            className={`${estiloPildora} bg-amber-500 text-white shadow-sm transition-colors hover:bg-amber-600`}
          >
            + Asignar partes
          </button>
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
                    title="Muebles completos: los que alcanza la parte más atrasada, con lo entregado en el último paso de cada parte"
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
          {m.ruta.map((p, j) => (
            <li key={p.id ?? `${p.proceso}-${j}`} className="flex flex-1 items-start last:flex-none">
              <button
                type="button"
                onClick={onAlternar}
                className="rounded-lg p-1 transition-colors hover:bg-slate-50"
              >
                <Paso mueble={m} indice={j} />
              </button>
              {j < m.ruta.length - 1 && (
                // A la altura del centro del círculo (p-1 del botón + mitad de size-16,
                // menos la mitad del grosor), no del paso con su etiqueta.
                <span
                  aria-hidden
                  className="mx-1 mt-[35px] h-0.5 min-w-2 flex-1 rounded-full transition-colors"
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

// Un paso del flujo: anillo con el avance del paso (con despiece, ponderado por el % de
// cada parte). Solo muestra: se asigna desde la tabla del despiece o con el botón de la
// fila.
function Paso({ mueble: m, indice }: { mueble: MuebleFlujo; indice: number }) {
  const a = avancePaso(m, indice);
  const etiqueta = etiquetaPaso(m.ruta, indice);
  // Con despiece, el avance pondera cada parte por su % del mueble.
  const pct = avancePonderado(m, indice);
  const color = COLOR[a.estado];
  const titulo = `${indice + 1}. ${etiqueta}: ${pct}% · ${a.entregado}/${m.cantidad} entregadas, ${a.asignado} asignadas${
    a.porReasignar > 0 ? `, ${a.porReasignar} rechazadas por Calidad sin reasignar` : ""
  }`;

  return (
    <span className="flex flex-col items-center gap-1.5" title={titulo}>
      <span
        className="relative grid size-16 place-items-center rounded-full transition-[background] duration-300"
        style={{
          background:
            a.estado === "sin_asignar"
              ? "transparent"
              : `conic-gradient(${color} ${pct}%, var(--color-slate-200) 0)`,
          border: a.estado === "sin_asignar" ? `2px dashed ${color}` : undefined,
        }}
      >
        <span
          className="grid size-[3.25rem] place-items-center rounded-full bg-white text-sm font-bold tabular-nums"
          style={{ color }}
        >
          {a.estado === "terminado" ? "✓" : `${pct}%`}
        </span>
        {a.porReasignar > 0 && (
          <span className="absolute -top-1 -left-1 grid size-5 place-items-center rounded-full bg-rose-500 text-xs font-bold leading-none text-white">
            !
          </span>
        )}
      </span>
      <span className="text-xs font-medium leading-tight whitespace-nowrap text-slate-700">{etiqueta}</span>
    </span>
  );
}

// Quita o agrega un proceso a la ruta de una parte (guardar_procesos_parte). Un proceso
// con asignaciones vigentes de la parte no se quita: la base lo rechaza.
function CambiarProcesoParte({
  parte,
  proceso,
  lleva,
}: {
  parte: ParteMueble;
  proceso: Proceso;
  lleva: boolean;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  async function cambiar() {
    const actuales = parte.procesosOmitidos ?? [];
    const omitidos = lleva ? [...actuales, proceso] : actuales.filter((p) => p !== proceso);
    setGuardando(true);
    const { error } = await createClient().rpc("guardar_procesos_parte", {
      p_parte_id: parte.id,
      p_omitidos: omitidos,
    });
    setGuardando(false);
    if (error) {
      avisar(mensajeErrorRpc(error.message), "error");
      return;
    }
    avisar(
      lleva
        ? `"${parte.descripcion}" ya no pasa por ${PROCESO_LABELS[proceso]}`
        : `"${parte.descripcion}" ahora pasa por ${PROCESO_LABELS[proceso]}`
    );
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={cambiar}
      disabled={guardando}
      title={
        lleva
          ? `Esta parte no pasa por ${PROCESO_LABELS[proceso]}: quitar el proceso de su ruta`
          : `Agregar ${PROCESO_LABELS[proceso]} a la ruta de esta parte`
      }
      className="rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
    >
      {lleva ? "Quitar" : "+ Agregar"}
    </button>
  );
}

// El despiece del mueble al abrirlo: sus partes y,
// por cada paso de la ruta, lo que lleva esa parte en piezas. Ahí se asigna (el "+" de la
// celda abre el formulario con esa parte y ese paso) y se arma la ruta de cada parte
// (quitar o agregar el proceso). Sin despiece (y con componentes), el aviso para hacerlo.
function Despiece({ mueble: m, asignar }: { mueble: MuebleFlujo; asignar: AsignarDesdeFlujo | null }) {
  const partes = m.partes ?? [];
  if (requiereDespiece(m)) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <p>Este mueble tiene componentes: guarda su despiece para asignarlo por partes.</p>
        {asignar && (
          <EnlaceDespiece mueble={m} className="font-semibold underline">
            Hacer despiece
          </EnlaceDespiece>
        )}
      </div>
    );
  }
  if (partes.length === 0) return null;
  const avances = m.ruta.map((_, i) => avancePaso(m, i));
  const fmt = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-700">
          Despiece ({partes.length} partes){" "}
          <span className="font-normal text-slate-500">· en piezas de cada parte; asigna con el +</span>
        </p>
        <EnlaceDespiece mueble={m} className="font-medium text-sky-700 underline">
          Ver o editar despiece
        </EnlaceDespiece>
      </div>
      <div className="overflow-x-auto rounded-lg bg-white">
        <table className="w-full text-left tabular-nums">
          <thead className="text-slate-500">
            <tr>
              <th className="p-2 font-medium">Parte</th>
              {m.ruta.map((_, i) => (
                <th key={i} className="p-2 font-medium whitespace-nowrap">
                  {etiquetaPaso(m.ruta, i)}
                </th>
              ))}
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
                {avances.map((a, i) => {
                  const proceso = m.ruta[i].proceso;
                  const x = a.partes[p.id];
                  if (!parteLleva(p, proceso)) {
                    return (
                      <td key={i} className="p-2 whitespace-nowrap text-slate-500">
                        <span className="flex items-start gap-2">
                          {asignar && <span aria-hidden className="size-6 shrink-0" />}
                          <span>
                            <span className="block">No lleva</span>
                            {asignar && <CambiarProcesoParte parte={p} proceso={proceso} lleva={false} />}
                          </span>
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td key={i} className="p-2 whitespace-nowrap text-slate-600">
                      <span className="flex items-start gap-2">
                        {/* El "+" a la izquierda: asigna esta parte en este paso. */}
                        {asignar && x && x.disponible > 0 ? (
                          <BotonAsignar
                            mueble={m}
                            indice={i}
                            parte={p.id}
                            asignar={asignar}
                            titulo={`Asignar ${p.descripcion} en ${etiquetaPaso(m.ruta, i)} (${fmt(x.disponible)} ${p.unidad ?? "pz"} por asignar)`}
                            className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-500 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400"
                          >
                            +
                          </BotonAsignar>
                        ) : (
                          asignar && <span aria-hidden className="size-6 shrink-0" />
                        )}
                        <span>
                          <span
                            className="block font-medium text-slate-900"
                            title={`Entregadas / piezas de la parte (${x ? fmt(x.asignado) : 0} asignadas)`}
                          >
                            {x ? `${fmt(x.entregado)}/${fmt(x.total)}` : "—"}
                            <span className="ml-1 font-normal text-slate-500">{p.unidad ?? "pz"}</span>
                          </span>
                          {asignar && x && x.asignado === 0 && (
                            <CambiarProcesoParte parte={p} proceso={proceso} lleva />
                          )}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
      <Despiece mueble={m} asignar={asignar} />
      <div className="grid gap-3 lg:grid-cols-2">
        {m.ruta.map((p, i) => {
          const lista = asignacionesDelPaso(m, i);
          const a = avancePaso(m, i);
          return (
            <details key={p.id ?? `${p.proceso}-${i}`} open className="group flex flex-col gap-1.5 text-xs">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="text-xs text-slate-500 transition-transform group-open:rotate-90">
                  ▶
                </span>
                <span className="font-semibold text-slate-700">
                  {i + 1}. {etiquetaPaso(m.ruta, i)}
                  {i > 0 && a.disponible > 0 && (
                    <span className="ml-1 font-normal text-slate-500">· {a.listo} listas</span>
                  )}
                </span>
              </summary>
              <div className="flex items-center justify-between gap-2">
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
            </details>
          );
        })}
      </div>
    </div>
  );
}
