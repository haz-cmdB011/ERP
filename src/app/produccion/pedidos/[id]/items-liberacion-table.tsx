"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ImagenAmpliable from "@/components/imagen-ampliable";
import { IconoCheck, IconoReloj } from "@/components/iconos-estado";
import { colorFilaEstadoRevision, ESTADO_REVISION_LABELS, type EstadoRevision } from "@/lib/planeacion/estado-revision";
import { avisar } from "@/components/avisos";
import EnlaceFila from "@/components/enlace-fila";
import MenuMas from "@/components/menu-mas";
import { agregarItems, useCarrito } from "@/lib/produccion/carrito-navegador";
import type { ItemCarrito } from "@/lib/produccion/carrito";
import { estiloMaterial } from "@/lib/ui/material";

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
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [filtroMaterial, setFiltroMaterial] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  // Un ítem con eliminación solicitada o cancelado (estado_revision, decidido
  // en Planeación) sale de la lista normal y solo vive en /produccion/cancelados.
  const itemsActivos = useMemo(
    () => items.filter((i) => !i.eliminacion_solicitada_en && i.estado_revision !== "cancelado"),
    [items]
  );

  // Producción solo ve los muebles padre (MO). Sus componentes no salen en la lista: viajan
  // con su mueble al carrito (para liberarse juntos) y se trabajan en el despiece.
  const muebles = useMemo(() => itemsActivos.filter((i) => i.tipo_registro === "MO"), [itemsActivos]);
  const hijosPorPadre = useMemo(() => {
    const mapa = new Map<string, ItemLiberacionRow[]>();
    for (const i of itemsActivos) {
      if (i.tipo_registro !== "FU" || !i.parent_item_id) continue;
      const lista = mapa.get(i.parent_item_id) ?? [];
      lista.push(i);
      mapa.set(i.parent_item_id, lista);
    }
    return mapa;
  }, [itemsActivos]);

  const conteos = useMemo(
    () => ({
      todos: muebles.length,
      listos: muebles.filter(esListo).length,
      incompletos: muebles.filter((i) => !esListo(i)).length,
    }),
    [muebles]
  );

  // Atajo para liberar de un golpe: todo lo que ya está listo (ingeniería,
  // suministro y lista de insumos) y sigue pendiente, sin importar el filtro.
  const idsListosPorLiberar = useMemo(
    () =>
      muebles
        .filter((i) => esListo(i) && i.estado_liberacion === "pendiente")
        .map((i) => i.id),
    [muebles]
  );

  const filtrosActivos = (filtroEstado !== "todos" ? 1 : 0) + (filtroMaterial ? 1 : 0);

  // Los muebles con los filtros y la búsqueda aplicados. Un mueble entra si él o alguno
  // de sus componentes coincide con el texto buscado (código, modelo, descripción,
  // material o folio).
  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    const coincide = (item: ItemLiberacionRow) =>
      !q ||
      normalizar(
        [item.item_code, item.modelo, item.descripcion, item.tipo_material, item.folio]
          .filter((v) => v !== null && v !== undefined)
          .join(" ")
      ).includes(q);
    return muebles.filter((item) => {
      if (filtroEstado === "listos" && !esListo(item)) return false;
      if (filtroEstado === "incompletos" && esListo(item)) return false;
      if (filtroMaterial && item.tipo_material?.toUpperCase() !== filtroMaterial) return false;
      return coincide(item) || (hijosPorPadre.get(item.id) ?? []).some(coincide);
    });
  }, [muebles, hijosPorPadre, filtroEstado, filtroMaterial, busqueda]);

  // "Seleccionar todos" abarca todo lo que se ve con los filtros y la búsqueda actuales.
  const idsFiltrados = useMemo(() => visibles.map((m) => m.id), [visibles]);
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

  // Pasa los muebles marcados al carrito, que junta ítems de cualquier PM u O.T. para
  // liberarlos y asignarlos a equipos desde ahí.
  function agregarSeleccionAlCarrito() {
    agregarMueblesAlCarrito(muebles.filter((i) => seleccionados.has(i.id)));
    setSeleccionados(new Set());
  }

  // Cada mueble lleva consigo sus componentes: se liberan juntos y con ellos se arma el despiece.
  function agregarMueblesAlCarrito(padres: ItemLiberacionRow[]) {
    const filas = padres.flatMap((p) => [p, ...(hijosPorPadre.get(p.id) ?? [])]);
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
    const nuevosMuebles = padres.filter((p) => !idsEnCarrito.has(p.id)).length;
    const repetidos = padres.length - nuevosMuebles;
    const agregados = agregarItems(nuevos);
    avisar(
      agregados === 0
        ? "Esos muebles ya estaban en el carrito."
        : `${nuevosMuebles} mueble(s) al carrito${repetidos > 0 ? ` (${repetidos} ya estaban)` : ""}.`,
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
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <IconoCheck />
          Enviado a Producción
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-0.5 text-sm font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
        <IconoReloj />
        Pendiente
      </span>
    );
  }

  function Fila({ item }: { item: ItemLiberacionRow }) {
    const enCarrito = idsEnCarrito.has(item.id);
    const seleccionado = seleccionados.has(item.id);
    const componentes = hijosPorPadre.get(item.id)?.length ?? 0;

    return (
      <tr
        key={item.id}
        className={`align-top text-sm text-slate-900 transition-colors ${
          seleccionado
            ? "bg-brand-50"
            : colorFilaEstadoRevision(item.estado_revision) || "hover:bg-slate-50"
        }`}
      >
        <td className="px-2 py-3 sm:px-3 lg:py-2">
          <input
            type="checkbox"
            checked={seleccionado}
            onChange={() => alternarSeleccion(item.id)}
            aria-label={`Seleccionar ítem ${item.item_code}`}
            className="h-4 w-4 cursor-pointer"
          />
        </td>
        <td className="py-3 pr-1 lg:px-3 lg:py-2">
          {item.imagenUrl ? (
            <ImagenAmpliable
              url={item.imagenUrl}
              urlGrande={item.imagenGrandeUrl}
              alt={`Ítem ${item.item_code}${item.modelo ? ` — ${item.modelo}` : ""}`}
              className="h-16 w-16 lg:h-20 lg:w-20"
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded bg-slate-100 text-center text-[9px] font-medium leading-tight text-slate-500 lg:h-20 lg:w-20">
              Sin imagen
            </span>
          )}
        </td>
        <td className="px-2 py-3 sm:px-3 lg:py-2">
          <span className="inline-flex items-center gap-1.5 text-lg font-bold">
            <span className="inline-grid h-9 min-w-9 place-items-center rounded-lg bg-brand-100 px-2 text-brand-900">
              {item.item_code}
            </span>
            {/* Tablet: el modelo va junto al número, como título de la ficha. */}
            {item.modelo && <span className="lg:hidden">· {item.modelo}</span>}
          </span>
          {componentes > 0 && (
            <span
              className="mt-0.5 block text-xs font-normal text-slate-500"
              title="Viajan con el mueble al carrito; ahí se hace su despiece"
            >
              {componentes} componente{componentes === 1 ? "" : "s"}
            </span>
          )}
          {/* Tablet y celular: el resto de las columnas, apiladas en la misma
              celda (en escritorio cada dato tiene su columna). */}
          <div className="mt-1 flex flex-col gap-1 text-sm font-normal text-slate-700 lg:hidden">
            {item.descripcion && <p className="line-clamp-3">{item.descripcion}</p>}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="text-base font-semibold text-slate-900">
                {item.cantidad_total} {item.unidad}
              </span>
              {item.tipo_material && (
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${estiloMaterial(item.tipo_material)?.pastilla ?? "bg-slate-100 text-slate-600"}`}
                >
                  {item.tipo_material}
                </span>
              )}
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
          <span className="text-lg font-semibold">{item.modelo}</span>
          {item.descripcion && (
            <span className="mt-0.5 line-clamp-2 block text-xs font-normal text-slate-500">
              {item.descripcion.split("\n")[0]}
            </span>
          )}
        </td>
        <td className="hidden px-3 py-2 text-sm font-normal text-slate-600 lg:table-cell">
          {item.tipo_material && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estiloMaterial(item.tipo_material)?.pastilla ?? "bg-slate-100 text-slate-600"}`}
            >
              {item.tipo_material}
            </span>
          )}
        </td>
        <td className="hidden whitespace-nowrap px-3 py-2 text-base font-semibold lg:table-cell">
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
        <td className="px-3 py-3 lg:py-2">
          <div className="flex flex-col items-center gap-2 lg:flex-row lg:flex-wrap">
            <EnlaceFila
              href={`/produccion/pedidos/${pedidoId}/viajero/${item.id}`}
              title="Viajero"
              aria-label={`Viajero del ítem ${item.item_code}`}
              className="flex h-11 w-11 items-center justify-center rounded border border-sky-200 bg-sky-50 text-sky-700 transition-colors hover:border-sky-400 hover:bg-sky-100 lg:h-8 lg:w-8"
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
            <button
              type="button"
              onClick={() => agregarMueblesAlCarrito([item])}
              title={enCarrito ? "Ya está en el carrito" : "Agregar al carrito"}
              aria-label={`Agregar el ítem ${item.item_code} al carrito`}
              className={`flex h-11 w-11 items-center justify-center rounded border transition-colors lg:h-8 lg:w-8 ${
                enCarrito
                  ? "border-brand-600 bg-brand-500 text-on-brand"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100"
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
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
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
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
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
        </div>
      )}

      <>
          {busqueda.trim() && (
            <p className="text-sm text-slate-500">{visibles.length} resultado(s)</p>
          )}

          {/* Barra de acción masiva: sticky para no tener que subir hasta
              arriba en pedidos con muchos ítems después de seleccionar. La acción
              principal es agregar al carrito (ahí se libera y se asigna); lo demás va en "Más". */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-brand-200 bg-brand-50/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
            <label className="flex min-h-9 items-center gap-2 text-sm font-medium text-slate-900">
              <input
                type="checkbox"
                checked={todosFiltradosSeleccionados}
                onChange={alternarSeleccionTodos}
                disabled={idsFiltrados.length === 0}
                className="h-4 w-4 cursor-pointer"
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
                className="text-xs text-slate-500 underline hover:text-slate-700"
              >
                Quitar selección
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <MenuMas
                compacto
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
                className="min-h-9 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-400 disabled:opacity-50"
              >
                Agregar al carrito{seleccionados.size > 0 ? ` (${seleccionados.size})` : ""}
              </button>
            </div>
          </div>

          {visibles.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              {busqueda.trim()
                ? `Ningún mueble coincide con "${busqueda.trim()}".`
                : "Ningún mueble coincide con el filtro seleccionado."}
            </p>
          )}

          {visibles.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
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
                <tbody className="divide-y divide-slate-200">
                  {visibles.map((m) => Fila({ item: m }))}
                </tbody>
              </table>
            </div>
          )}
      </>
    </div>
  );
}
