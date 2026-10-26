"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ImagenAmpliable from "@/components/imagen-ampliable";
import { IconoCheck, IconoReloj } from "@/components/iconos-estado";
import { colorFilaEstadoRevision, ESTADO_REVISION_LABELS, type EstadoRevision } from "@/lib/planeacion/estado-revision";
import { avisar } from "@/components/avisos";
import GrupoDesplegable from "@/components/grupo-desplegable";
import EnlaceFila from "@/components/enlace-fila";
import MenuMas from "@/components/menu-mas";
import BotonDesplegar from "@/components/boton-desplegar";
import { useFlip } from "@/lib/ui/use-flip";
import { agregarItems, useCarrito } from "@/lib/produccion/carrito-navegador";
import type { ItemCarrito } from "@/lib/produccion/carrito";

export interface ItemLiberacionRow {
  id: string;
  item_code: number;
  tipo_registro: "MO" | "FU";
  tipo_material: string | null;
  modelo: string | null;
  descripcion: string | null;
  cantidad_x_mueble: number | null;
  unidad: string | null;
  cantidad_total: number;
  parent_item_id: string | null;
  fila_excel_origen: number | null;
  ingenieria: boolean | null;
  lista_insumos: string | null;
  suministro_mats: boolean | null;
  estado_liberacion: "pendiente" | "enviado_a_produccion";
  eliminacion_solicitada_en: string | null;
  eliminacion_solicitada_por: string | null;
  estado_revision: EstadoRevision;
  folio: string | null;
  imagenUrl: string | null;
  imagenGrandeUrl: string | null;
}

interface GrupoMueble {
  padre: ItemLiberacionRow;
  // Hijos que se muestran al desplegar: todos si el mueble coincide con la
  // búsqueda (o no hay búsqueda); solo los que coinciden si coincidió un hijo.
  hijos: ItemLiberacionRow[];
  totalHijos: number;
  abrirPorBusqueda: boolean;
}

type FiltroEstado = "todos" | "listos" | "incompletos";

const MATERIALES = ["MADERA", "METAL", "TAPIZ", "HIBRIDO"] as const;

function esListo(item: ItemLiberacionRow): boolean {
  return (
    item.ingenieria === true &&
    item.suministro_mats === true &&
    !!item.lista_insumos?.trim()
  );
}

// Búsqueda sin distinguir mayúsculas ni acentos ("pergola" encuentra "PÉRGOLA").
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export default function ItemsLiberacionTable({
  items,
  pedidoId,
  numeroPm,
  ot,
}: {
  items: ItemLiberacionRow[];
  pedidoId: string;
  numeroPm: string;
  ot: string | null;
}) {
  const router = useRouter();
  const enElCarrito = useCarrito();
  const idsEnCarrito = useMemo(() => new Set(enElCarrito.map((i) => i.id)), [enElCarrito]);
  const tablaRef = useFlip<HTMLTableElement>();
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [filtroMaterial, setFiltroMaterial] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  // Muebles desplegados a mano (true/false); sin entrada, se decide solo: cerrado,
  // salvo que la búsqueda haya coincidido únicamente con un hijo.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  // Un ítem con eliminación solicitada o cancelado (estado_revision, decidido
  // en Planeación) sale de la lista normal y solo vive en /produccion/cancelados.
  const itemsActivos = useMemo(
    () => items.filter((i) => !i.eliminacion_solicitada_en && i.estado_revision !== "cancelado"),
    [items]
  );

  const conteos = useMemo(
    () => ({
      todos: itemsActivos.length,
      listos: itemsActivos.filter(esListo).length,
      incompletos: itemsActivos.filter((i) => !esListo(i)).length,
    }),
    [itemsActivos]
  );

  // Atajo para liberar de un golpe: todo lo que ya está listo (ingeniería,
  // suministro y lista de insumos) y sigue pendiente, sin importar el filtro.
  const idsListosPorLiberar = useMemo(
    () =>
      itemsActivos
        .filter((i) => esListo(i) && i.estado_liberacion === "pendiente")
        .map((i) => i.id),
    [itemsActivos]
  );

  const filtrosActivos = (filtroEstado !== "todos" ? 1 : 0) + (filtroMaterial ? 1 : 0);

  const itemsFiltrados = useMemo(() => {
    return itemsActivos.filter((item) => {
      if (filtroEstado === "listos" && !esListo(item)) return false;
      if (filtroEstado === "incompletos" && esListo(item)) return false;
      if (filtroMaterial && item.tipo_material?.toUpperCase() !== filtroMaterial) return false;
      return true;
    });
  }, [itemsActivos, filtroEstado, filtroMaterial]);

  // Agrupación visual mueble (MO, "ítem padre") -> componentes (FU, "hijos"),
  // ya con la búsqueda aplicada. Un mueble entra si él o alguno de sus hijos
  // coincide con el texto buscado (código, modelo, descripción, material o
  // folio). Los MO sin hijos se muestran solos.
  const { grupos, sueltos } = useMemo(() => {
    const q = normalizar(busqueda);
    const coincide = (item: ItemLiberacionRow) =>
      !q ||
      normalizar(
        [item.item_code, item.modelo, item.descripcion, item.tipo_material, item.folio]
          .filter((v) => v !== null && v !== undefined)
          .join(" ")
      ).includes(q);

    const hijosPorPadre = new Map<string, ItemLiberacionRow[]>();
    const idsMO = new Set<string>();
    for (const item of itemsFiltrados) {
      if (item.tipo_registro === "MO") idsMO.add(item.id);
    }
    for (const item of itemsFiltrados) {
      if (item.tipo_registro === "FU" && item.parent_item_id && idsMO.has(item.parent_item_id)) {
        const lista = hijosPorPadre.get(item.parent_item_id) ?? [];
        lista.push(item);
        hijosPorPadre.set(item.parent_item_id, lista);
      }
    }

    const grupos: GrupoMueble[] = [];
    for (const padre of itemsFiltrados) {
      if (padre.tipo_registro !== "MO") continue;
      const todos = hijosPorPadre.get(padre.id) ?? [];
      const padreCoincide = coincide(padre);
      const hijosCoinciden = todos.filter(coincide);
      if (!padreCoincide && hijosCoinciden.length === 0) continue;
      grupos.push({
        padre,
        hijos: padreCoincide ? todos : hijosCoinciden,
        totalHijos: todos.length,
        abrirPorBusqueda: !!q && !padreCoincide,
      });
    }

    // FU huérfanos dentro del filtro actual (su MO padre quedó fuera del filtro).
    const sueltos = itemsFiltrados.filter(
      (i) =>
        i.tipo_registro === "FU" &&
        !(i.parent_item_id && idsMO.has(i.parent_item_id)) &&
        coincide(i)
    );
    return { grupos, sueltos };
  }, [itemsFiltrados, busqueda]);

  // "Seleccionar todos" abarca todo lo que se ve con los filtros y la
  // búsqueda actuales, incluidos los hijos de muebles que estén contraídos.
  const idsFiltrados = useMemo(
    () => [
      ...grupos.flatMap((g) => [g.padre.id, ...g.hijos.map((h) => h.id)]),
      ...sueltos.map((s) => s.id),
    ],
    [grupos, sueltos]
  );
  const todosFiltradosSeleccionados =
    idsFiltrados.length > 0 && idsFiltrados.every((id) => seleccionados.has(id));

  function alternarSeleccion(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alternarSeleccionTodos() {
    setSeleccionados((prev) => {
      if (todosFiltradosSeleccionados) {
        const next = new Set(prev);
        for (const id of idsFiltrados) next.delete(id);
        return next;
      }
      return new Set([...prev, ...idsFiltrados]);
    });
  }

  function estaAbierto(grupo: GrupoMueble): boolean {
    return abiertos[grupo.padre.id] ?? grupo.abrirPorBusqueda;
  }

  function alternarMueble(grupo: GrupoMueble) {
    const actual = estaAbierto(grupo);
    setAbiertos((prev) => ({ ...prev, [grupo.padre.id]: !actual }));
  }

  function desplegarTodos(abrir: boolean) {
    setAbiertos(Object.fromEntries(grupos.map((g) => [g.padre.id, abrir])));
  }

  // Marcar un mueble marca también sus componentes (y desmarcarlo, los
  // desmarca): así se puede liberar un mueble completo sin desplegarlo.
  // Cada hijo se puede seguir marcando por separado una vez desplegado.
  function alternarGrupo(grupo: GrupoMueble) {
    const ids = [grupo.padre.id, ...grupo.hijos.map((h) => h.id)];
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (prev.has(grupo.padre.id)) for (const id of ids) next.delete(id);
      else for (const id of ids) next.add(id);
      return next;
    });
  }

  // Pasa lo marcado (muebles y componentes) al carrito, que junta ítems de
  // cualquier PM u O.T. para liberarlos y asignarlos a equipos desde ahí.
  function agregarSeleccionAlCarrito() {
    agregarFilasAlCarrito(items.filter((i) => seleccionados.has(i.id)));
    setSeleccionados(new Set());
  }

  function agregarFilasAlCarrito(filas: ItemLiberacionRow[]) {
    const nuevos: ItemCarrito[] = filas.map((i) => ({
      id: i.id,
      tipo: i.tipo_registro,
      itemCode: i.item_code,
      modelo: i.modelo,
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad_total),
      unidad: i.unidad,
      padreId: i.parent_item_id,
      pedidoId,
      numeroPm,
      ot,
    }));
    const agregados = agregarItems(nuevos);
    const repetidos = nuevos.length - agregados;
    avisar(
      agregados === 0
        ? "Esos ítems ya estaban en el carrito."
        : `${agregados} ítem(s) al carrito${repetidos > 0 ? ` (${repetidos} ya estaban)` : ""}.`,
      agregados === 0 ? "info" : "exito",
      {
        etiqueta: "Ver carrito",
        alHacer: () => router.push("/produccion/carrito"),
      }
    );
  }

  function EstadoBadge({ item }: { item: ItemLiberacionRow }) {
    if (item.estado_liberacion === "enviado_a_produccion") {
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-emerald-700">
          <IconoCheck />
          Enviado a Producción
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-slate-500">
        <IconoReloj />
        Pendiente
      </span>
    );
  }

  // `grupo` solo viene en las filas de mueble (MO): con hijos, la fila entera
  // es clicable para desplegarlos/contraerlos; sin hijos, es una fila normal.
  function Fila({
    item,
    indentado,
    grupo,
    indice = 0,
  }: {
    item: ItemLiberacionRow;
    indentado: boolean;
    grupo?: GrupoMueble;
    // Posición entre los hijos de su mueble: escalona la entrada.
    indice?: number;
  }) {
    const enCarrito = idsEnCarrito.has(item.id);
    const seleccionado = seleccionados.has(item.id);
    const desplegable = !!grupo && grupo.totalHijos > 0;
    const abierto = grupo ? estaAbierto(grupo) : false;
    // Los controles de la fila no deben desplegar/contraer el mueble.
    const sinToggle = (e: React.MouseEvent) => e.stopPropagation();

    return (
      <tr
        key={item.id}
        onClick={desplegable && grupo ? () => alternarMueble(grupo) : undefined}
        data-flip={item.id}
        style={indentado ? ({ "--i": indice } as React.CSSProperties) : undefined}
        className={`align-top transition-colors ${indentado ? "fila-hija" : ""} ${abierto && desplegable ? "fila-padre-abierta" : ""} ${
          seleccionado
            ? "bg-brand-50"
            : colorFilaEstadoRevision(item.estado_revision) || "hover:bg-slate-50"
        } ${indentado ? "text-slate-700" : "text-sm text-slate-900"} ${
          desplegable ? "cursor-pointer" : ""
        }`}
      >
        <td className={`px-2 py-3 sm:px-3 lg:py-2 ${indentado ? "guia-hija" : ""}`} onClick={sinToggle}>
          <input
            type="checkbox"
            checked={seleccionados.has(item.id)}
            onChange={() => (grupo ? alternarGrupo(grupo) : alternarSeleccion(item.id))}
            aria-label={`Seleccionar ítem ${item.item_code}`}
          />
        </td>
        <td className="py-3 pr-1 lg:px-3 lg:py-2">
          {item.imagenUrl ? (
            <ImagenAmpliable
              url={item.imagenUrl}
              urlGrande={item.imagenGrandeUrl}
              alt={`Ítem ${item.item_code}${item.modelo ? ` — ${item.modelo}` : ""}`}
              className={indentado ? "h-12 w-12 lg:h-9 lg:w-9" : "h-16 w-16 lg:h-11 lg:w-11"}
            />
          ) : (
            <span
              className={`flex items-center justify-center rounded bg-slate-100 text-center text-[9px] font-medium leading-tight text-slate-500 ${
                indentado ? "h-12 w-12 lg:h-9 lg:w-9" : "h-16 w-16 lg:h-11 lg:w-11"
              }`}
            >
              Sin imagen
            </span>
          )}
        </td>
        <td className="px-2 py-3 sm:px-3 lg:py-2">
          <span className="inline-flex items-center gap-1.5">
            {desplegable && grupo && (
              <BotonDesplegar
                abierto={abierto}
                alAlternar={() => alternarMueble(grupo)}
                descripcion={`los ${grupo.totalHijos} componente${grupo.totalHijos === 1 ? "" : "s"} del ítem ${item.item_code}`}
              />
            )}
            {item.item_code}
            {/* Tablet: el modelo va junto al número, como título de la ficha. */}
            {item.modelo && <span className="lg:hidden">· {item.modelo}</span>}
          </span>
          {desplegable && grupo && (
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              {grupo.totalHijos} componente{grupo.totalHijos === 1 ? "" : "s"}
              {grupo.hijos.length !== grupo.totalHijos ? ` (${grupo.hijos.length} coinciden)` : ""}
            </span>
          )}
          {/* Tablet y celular: el resto de las columnas, apiladas en la misma
              celda (en escritorio cada dato tiene su columna). */}
          <div className="mt-1 flex flex-col gap-1 text-sm font-normal text-slate-700 lg:hidden">
            {item.descripcion && (
              <p className={indentado ? "line-clamp-2" : "line-clamp-3"}>
                {indentado ? item.descripcion.split("\n")[0] : item.descripcion}
              </p>
            )}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                {item.cantidad_total} {item.unidad}
              </span>
              {item.tipo_material && <span>{item.tipo_material}</span>}
              {item.folio && <span className="font-mono text-slate-800">{item.folio}</span>}
            </p>
            <div>
              {EstadoBadge({ item })}
              {item.estado_revision && (
                <span className="mt-1 block text-xs font-semibold">
                  {ESTADO_REVISION_LABELS[item.estado_revision]} (Planeación)
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="hidden px-3 py-2 lg:table-cell">
          <span className={indentado ? "" : "font-medium"}>{item.modelo}</span>
          {item.descripcion && (
            <span className="mt-0.5 line-clamp-2 block text-xs font-normal text-slate-500">
              {item.descripcion.split("\n")[0]}
            </span>
          )}
        </td>
        <td className="hidden px-3 py-2 lg:table-cell">{item.tipo_material}</td>
        <td className="hidden px-3 py-2 lg:table-cell">
          {item.cantidad_total} {item.unidad}
        </td>
        <td className="hidden px-3 py-2 lg:table-cell">
          {EstadoBadge({ item })}
          {item.estado_revision && (
            <span className="mt-1 block text-xs font-semibold">
              {ESTADO_REVISION_LABELS[item.estado_revision]} (Planeación)
            </span>
          )}
        </td>
        <td className="hidden px-3 py-2 lg:table-cell">
          {item.folio ? (
            <span
              className="whitespace-nowrap font-mono text-xs text-slate-800"
              title="Folio único de producción"
            >
              {item.folio}
            </span>
          ) : (
            <span className="text-xs text-slate-500" title="Se asigna al liberarlo a producción">
              —
            </span>
          )}
        </td>
        <td className="px-3 py-3 lg:py-2" onClick={sinToggle}>
          <div className="flex flex-col items-center gap-2 lg:flex-row lg:flex-wrap">
            <EnlaceFila
              href={`/produccion/pedidos/${pedidoId}/viajero/${item.id}`}
              title="Viajero"
              aria-label={`Viajero del ítem ${item.item_code}`}
              className="flex h-11 w-11 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 lg:h-8 lg:w-8"
            >
              {/* Avión de papel: el viajero es la hoja que acompaña al ítem. */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
              </svg>
            </EnlaceFila>
            {item.tipo_registro === "MO" && (
              <EnlaceFila
                href={`/produccion/pedidos/${pedidoId}/despiece/${item.id}`}
                title="Despiece"
                aria-label={`Despiece del ítem ${item.item_code}`}
                className="flex h-11 w-11 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 lg:h-8 lg:w-8"
              >
                {/* Capas: el mueble desglosado en sus piezas. */}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="m12 3 9 5-9 5-9-5 9-5Z" />
                  <path d="m3 13 9 5 9-5" />
                </svg>
              </EnlaceFila>
            )}
            {/* Un mueble lleva consigo sus componentes, igual que al marcarlo. */}
            <button
              type="button"
              onClick={() => agregarFilasAlCarrito(grupo ? [item, ...grupo.hijos] : [item])}
              title={enCarrito ? "Ya está en el carrito" : "Agregar al carrito"}
              aria-label={`Agregar el ítem ${item.item_code} al carrito`}
              className={`flex h-11 w-11 items-center justify-center rounded border transition-colors lg:h-8 lg:w-8 ${
                enCarrito
                  ? "border-brand-600 bg-brand-500 text-on-brand"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <circle cx="9" cy="20" r="1.5" />
                <circle cx="18" cy="20" r="1.5" />
                <path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Lo de siempre a la vista (buscar); estado y material, que se usan poco, quedan en
          "Filtros", plegado. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="relative w-full min-w-0 sm:w-auto sm:max-w-md sm:flex-1">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar mueble, modelo o folio"
                autoComplete="off"
                className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltrosAbiertos((v) => !v)}
              aria-expanded={filtrosAbiertos}
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ""}
            </button>
      </div>

      {filtrosAbiertos && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-full text-xs font-semibold uppercase tracking-wide text-slate-500 sm:w-auto">
              Mostrar
            </span>
            {(
              [
                ["todos", `Todos (${conteos.todos})`],
                ["listos", `Listos para liberar (${conteos.listos})`],
                ["incompletos", `Con pendientes (${conteos.incompletos})`],
              ] as [FiltroEstado, string][]
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltroEstado(valor)}
                className={`rounded-lg border px-3 py-1.5 font-medium transition-colors pointer-coarse:py-2.5 ${
                  filtroEstado === valor
                    ? "border-brand-600 bg-brand-500 text-on-brand"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          <p className="-mt-1 text-xs text-slate-500">
            Un mueble está listo para liberar cuando tiene ingeniería, materiales y lista de insumos.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-full text-xs font-semibold uppercase tracking-wide text-slate-500 sm:w-auto">
              Material
            </span>
            {([null, ...MATERIALES] as (string | null)[]).map((mat) => (
              <button
                key={mat ?? "todos"}
                type="button"
                onClick={() => setFiltroMaterial(mat)}
                className={`rounded-lg border px-3 py-1.5 font-medium transition-colors pointer-coarse:py-2.5 ${
                  filtroMaterial === mat
                    ? "border-brand-600 bg-brand-500 text-on-brand"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {mat ?? "Todos"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-full text-xs font-semibold uppercase tracking-wide text-slate-500 sm:w-auto">
              Componentes
            </span>
            <button
              type="button"
              onClick={() => desplegarTodos(true)}
              disabled={grupos.every((g) => g.totalHijos === 0)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 pointer-coarse:py-2.5"
            >
              Mostrar componentes
            </button>
            <button
              type="button"
              onClick={() => desplegarTodos(false)}
              disabled={grupos.every((g) => g.totalHijos === 0)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 pointer-coarse:py-2.5"
            >
              Ocultar componentes
            </button>
          </div>
        </div>
      )}

      <>
          {busqueda.trim() && (
            <p className="text-sm text-slate-500">{grupos.length + sueltos.length} resultado(s)</p>
          )}

          {/* Barra de acción masiva: sticky para no tener que subir hasta
              arriba en pedidos con muchos ítems después de seleccionar. La acción
              principal es agregar al carrito (ahí se libera y se asigna); lo demás va en "Más". */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white/95 p-3 text-sm shadow-sm backdrop-blur">
            <label className="flex min-h-9 items-center gap-2">
              <input
                type="checkbox"
                checked={todosFiltradosSeleccionados}
                onChange={alternarSeleccionTodos}
                disabled={idsFiltrados.length === 0}
              />
              Seleccionar todos ({idsFiltrados.length})
            </label>
            <span className="text-slate-500">
              {seleccionados.size === 0 ? "Marca lo que quieras llevar al carrito" : `${seleccionados.size} seleccionado(s)`}
            </span>
            {seleccionados.size > 0 && (
              <button
                type="button"
                onClick={() => setSeleccionados(new Set())}
                className="text-sm text-slate-500 underline hover:text-slate-700"
              >
                Quitar selección
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <MenuMas
                opciones={[
                  {
                    etiqueta: `Marcar los listos (${idsListosPorLiberar.length})`,
                    deshabilitada: idsListosPorLiberar.length === 0,
                    alHacer: () => setSeleccionados(new Set(idsListosPorLiberar)),
                  },
                  // Sin selección imprime las de todos los muebles liberados.
                  {
                    etiqueta: seleccionados.size > 0 ? `Etiquetas QR (${seleccionados.size})` : "Etiquetas QR de los liberados",
                    href: `/produccion/pedidos/${pedidoId}/etiquetas${
                      seleccionados.size > 0 ? `?ids=${Array.from(seleccionados).join(",")}` : ""
                    }`,
                    target: "_blank",
                  },
                ]}
              />
              <button
                type="button"
                onClick={agregarSeleccionAlCarrito}
                disabled={seleccionados.size === 0}
                title="Junta estos ítems con los de otros PM u O.T. para liberarlos y asignarlos a equipos"
                className="min-h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-400 disabled:opacity-50"
              >
                Agregar al carrito{seleccionados.size > 0 ? ` (${seleccionados.size})` : ""}
              </button>
            </div>
          </div>

          {grupos.length === 0 && sueltos.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              {busqueda.trim()
                ? `Ningún mueble ni componente coincide con "${busqueda.trim()}".`
                : "Ningún ítem coincide con el filtro seleccionado."}
            </p>
          )}

          {(grupos.length > 0 || sueltos.length > 0) && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table ref={tablaRef} className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2"></th>
                    <th className="py-2 pr-1 lg:px-3">Imagen</th>
                    <th className="px-3 py-2">Item</th>
                    <th className="hidden px-3 py-2 lg:table-cell">Modelo</th>
                    <th className="hidden px-3 py-2 lg:table-cell">Material</th>
                    <th className="hidden px-3 py-2 lg:table-cell">Cant.</th>
                    <th className="hidden px-3 py-2 lg:table-cell">Estado</th>
                    <th className="hidden px-3 py-2 lg:table-cell">Folio</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                {/* Un <tbody> por mueble: su fila y, si está desplegado, sus
                    componentes; el borde superior los separa entre sí. */}
                {grupos.map((g) => (
                  <GrupoDesplegable
                    key={g.padre.id}
                    abierto={estaAbierto(g)}
                    total={g.hijos.length}
                    className="divide-y divide-slate-100 border-t border-slate-200 first:border-t-0"
                  >
                    {(mostrarHijos) => (
                      <>
                        {Fila({ item: g.padre, indentado: false, grupo: g })}
                        {mostrarHijos &&
                          g.hijos.map((f, i) => Fila({ item: f, indentado: true, indice: i }))}
                      </>
                    )}
                  </GrupoDesplegable>
                ))}
                {sueltos.length > 0 && (
                  <tbody className="divide-y divide-slate-100 border-t border-slate-200">
                    {sueltos.map((f) => (
                      Fila({ item: f, indentado: false })
                    ))}
                  </tbody>
                )}
              </table>
            </div>
          )}
      </>
    </div>
  );
}
