"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConfirmDialog from "@/components/confirm-dialog";
import ImagenAmpliable from "@/components/imagen-ampliable";
import { colorFilaEstadoRevision, ESTADO_REVISION_LABELS, type EstadoRevision } from "@/lib/planeacion/estado-revision";

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
type Confirmacion = { tipo: "solicitar" | "definitivo"; item: ItemLiberacionRow };

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
  puedeSolicitarEliminacion,
  puedeEliminarDefinitivo,
}: {
  items: ItemLiberacionRow[];
  pedidoId: string;
  puedeSolicitarEliminacion: boolean;
  puedeEliminarDefinitivo: boolean;
}) {
  const router = useRouter();
  const [vistaPapelera, setVistaPapelera] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [filtroMaterial, setFiltroMaterial] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // Muebles desplegados a mano (true/false); sin entrada, se decide solo: cerrado,
  // salvo que la búsqueda haya coincidido únicamente con un hijo.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [liberando, setLiberando] = useState(false);
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  // Un ítem con eliminación solicitada sale de la lista normal y vive solo
  // en la Papelera hasta que se restaure o se elimine definitivamente. Un
  // ítem cancelado (estado_revision, decidido en Planeación) sale de la
  // lista normal y solo vive en /produccion/cancelados.
  const itemsActivos = useMemo(
    () => items.filter((i) => !i.eliminacion_solicitada_en && i.estado_revision !== "cancelado"),
    [items]
  );
  const itemsPapelera = useMemo(() => items.filter((i) => i.eliminacion_solicitada_en), [items]);

  const conteos = useMemo(
    () => ({
      todos: itemsActivos.length,
      listos: itemsActivos.filter(esListo).length,
      incompletos: itemsActivos.filter((i) => !esListo(i)).length,
    }),
    [itemsActivos]
  );

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

  async function liberarSeleccion() {
    if (seleccionados.size === 0) return;
    setLiberando(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/produccion/items/liberar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: Array.from(seleccionados) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error ?? "No se pudo liberar la selección." });
        return;
      }
      setMensaje({ tipo: "ok", texto: `${data.liberados} ítem(s) liberado(s) a producción.` });
      setSeleccionados(new Set());
      router.refresh();
    } catch {
      setMensaje({ tipo: "error", texto: "Error de red al liberar la selección." });
    } finally {
      setLiberando(false);
    }
  }

  async function revertirSeleccion() {
    if (seleccionados.size === 0) return;
    setRevirtiendo(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/produccion/items/revertir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: Array.from(seleccionados) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error ?? "No se pudo revertir la selección." });
        return;
      }
      setMensaje({ tipo: "ok", texto: `${data.revertidos} ítem(s) revertido(s) a pendiente.` });
      setSeleccionados(new Set());
      router.refresh();
    } catch {
      setMensaje({ tipo: "error", texto: "Error de red al revertir la selección." });
    } finally {
      setRevirtiendo(false);
    }
  }

  async function ejecutarSolicitarEliminacion(item: ItemLiberacionRow) {
    setProcesandoId(item.id);
    setMensaje(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("solicitar_eliminacion_item", { p_item_id: item.id });
    setProcesandoId(null);
    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
      return;
    }
    setMensaje({
      tipo: "ok",
      texto: `Ítem ${item.item_code} movido a la papelera. Puedes restaurarlo desde ahí.`,
    });
    setSeleccionados((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    router.refresh();
  }

  async function cancelarSolicitud(item: ItemLiberacionRow) {
    setProcesandoId(item.id);
    setMensaje(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("cancelar_solicitud_eliminacion_item", {
      p_item_id: item.id,
    });
    setProcesandoId(null);
    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
      return;
    }
    setMensaje({ tipo: "ok", texto: `Ítem ${item.item_code} restaurado.` });
    router.refresh();
  }

  async function ejecutarEliminarDefinitivo(item: ItemLiberacionRow) {
    setProcesandoId(item.id);
    setMensaje(null);
    const supabase = createClient();
    const { data: conservadoPorFolio, error } = await supabase.rpc("eliminar_item_definitivo", {
      p_item_id: item.id,
    });
    setProcesandoId(null);
    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
      return;
    }
    // El RPC no borra un ítem que ya tiene folio(s) de Calidad — lo deja
    // cancelado para no perder ese historial (ver Cancelados).
    setMensaje(
      conservadoPorFolio
        ? {
            tipo: "ok",
            texto: `Ítem ${item.item_code} ya tenía folio(s) de Calidad: se conservó como cancelado en vez de eliminarse. Puedes verlo en Cancelados.`,
          }
        : { tipo: "ok", texto: `Ítem ${item.item_code} eliminado definitivamente.` }
    );
    router.refresh();
  }

  function confirmarAccionPendiente() {
    if (!confirmacion) return;
    const { tipo, item } = confirmacion;
    setConfirmacion(null);
    if (tipo === "solicitar") ejecutarSolicitarEliminacion(item);
    else ejecutarEliminarDefinitivo(item);
  }

  function EstadoBadge({ item }: { item: ItemLiberacionRow }) {
    if (item.estado_liberacion === "enviado_a_produccion") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Enviado a Producción
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
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
  }: {
    item: ItemLiberacionRow;
    indentado: boolean;
    grupo?: GrupoMueble;
  }) {
    const procesando = procesandoId === item.id;
    const seleccionado = seleccionados.has(item.id);
    const desplegable = !!grupo && grupo.totalHijos > 0;
    const abierto = grupo ? estaAbierto(grupo) : false;
    // Los controles de la fila no deben desplegar/contraer el mueble.
    const sinToggle = (e: React.MouseEvent) => e.stopPropagation();

    return (
      <tr
        onClick={desplegable && grupo ? () => alternarMueble(grupo) : undefined}
        className={`align-top transition-colors ${
          seleccionado
            ? "bg-indigo-50"
            : colorFilaEstadoRevision(item.estado_revision) || "odd:bg-slate-50/60 hover:bg-slate-100/70"
        } ${indentado ? "text-slate-700" : "text-sm font-medium text-slate-900"} ${
          desplegable ? "cursor-pointer" : ""
        }`}
      >
        <td className="px-3 py-2" onClick={sinToggle}>
          <input
            type="checkbox"
            checked={seleccionados.has(item.id)}
            onChange={() => (grupo ? alternarGrupo(grupo) : alternarSeleccion(item.id))}
            aria-label={`Seleccionar ítem ${item.item_code}`}
          />
        </td>
        <td className="px-3 py-2">
          {item.imagenUrl ? (
            <ImagenAmpliable
              url={item.imagenUrl}
              urlGrande={item.imagenGrandeUrl}
              alt={`Ítem ${item.item_code}${item.modelo ? ` — ${item.modelo}` : ""}`}
              className={indentado ? "h-9 w-9" : "h-11 w-11"}
            />
          ) : (
            <span
              className={`block rounded border border-dashed border-slate-200 ${
                indentado ? "h-9 w-9" : "h-11 w-11"
              }`}
              title="Sin imagen"
            />
          )}
        </td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1.5">
            {desplegable && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${
                  abierto ? "rotate-90" : ""
                }`}
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            )}
            {item.item_code}
          </span>
          {desplegable && grupo && (
            <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
              {grupo.totalHijos} componente{grupo.totalHijos === 1 ? "" : "s"}
              {grupo.hijos.length !== grupo.totalHijos ? ` (${grupo.hijos.length} coinciden)` : ""}
            </span>
          )}
        </td>
        <td className="px-3 py-2">{item.modelo}</td>
        <td className="px-3 py-2">{item.tipo_material}</td>
        <td className="px-3 py-2">
          {indentado ? item.descripcion?.split("\n")[0] : item.descripcion}
        </td>
        <td className="px-3 py-2">
          {item.cantidad_total} {item.unidad}
        </td>
        <td className="px-3 py-2">
          <EstadoBadge item={item} />
          {item.estado_revision && (
            <span className="mt-1 block text-xs font-semibold">
              {ESTADO_REVISION_LABELS[item.estado_revision]} (Planeación)
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          {item.folio ? (
            <span
              className="whitespace-nowrap font-mono text-xs font-semibold text-slate-800"
              title="Folio único de producción"
            >
              {item.folio}
            </span>
          ) : (
            <span className="text-xs text-slate-400" title="Se asigna al liberarlo a producción">
              —
            </span>
          )}
        </td>
        <td className="flex flex-wrap items-center gap-2 px-3 py-2" onClick={sinToggle}>
          <Link
            href={`/produccion/pedidos/${pedidoId}/viajero/${item.id}`}
            title="Viajero"
            aria-label={`Viajero del ítem ${item.item_code}`}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100"
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
          </Link>
          {puedeSolicitarEliminacion && (
            <button
              type="button"
              onClick={() => setConfirmacion({ tipo: "solicitar", item })}
              disabled={procesando}
              title="Enviar a la papelera"
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                <path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
              Papelera
            </button>
          )}
        </td>
      </tr>
    );
  }

  const hijosDelItemAConfirmar =
    confirmacion?.tipo === "solicitar" && confirmacion.item.tipo_registro === "MO"
      ? items.filter((i) => i.parent_item_id === confirmacion.item.id).length
      : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros rápidos de liberación */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(
          [
            ["todos", `Todos los Ítems (${conteos.todos})`],
            ["listos", `Listos para Enviar (${conteos.listos})`],
            ["incompletos", `Incompletos / Requieren Atención (${conteos.incompletos})`],
          ] as [FiltroEstado, string][]
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            onClick={() => {
              setVistaPapelera(false);
              setFiltroEstado(valor);
            }}
            className={`rounded-full border px-3 py-1 font-medium transition-colors ${
              !vistaPapelera && filtroEstado === valor
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {etiqueta}
          </button>
        ))}
        {(puedeSolicitarEliminacion || puedeEliminarDefinitivo) && (
          <button
            type="button"
            onClick={() => setVistaPapelera((v) => !v)}
            className={`ml-auto rounded-full border px-3 py-1 font-medium transition-colors ${
              vistaPapelera
                ? "border-rose-600 bg-rose-600 text-white"
                : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            Papelera ({itemsPapelera.length})
          </button>
        )}
      </div>

      {mensaje && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            mensaje.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {vistaPapelera ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Ítems con eliminación solicitada. Se pueden restaurar mientras no se confirme la
            eliminación definitiva.
          </p>
          {itemsPapelera.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              La papelera está vacía.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Modelo</th>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Descripción</th>
                    <th className="px-3 py-2">Cant.</th>
                    <th className="px-3 py-2">Eliminado</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemsPapelera.map((item) => {
                    const procesando = procesandoId === item.id;
                    return (
                      <tr key={item.id} className="align-top text-slate-700 transition-colors hover:bg-slate-50">
                        <td className="px-3 py-2">{item.item_code}</td>
                        <td className="px-3 py-2">{item.modelo}</td>
                        <td className="px-3 py-2">{item.tipo_material}</td>
                        <td className="px-3 py-2">{item.descripcion}</td>
                        <td className="px-3 py-2">
                          {item.cantidad_total} {item.unidad}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {new Date(item.eliminacion_solicitada_en as string).toLocaleDateString()}
                        </td>
                        <td className="flex flex-wrap items-center gap-2 px-3 py-2">
                          {puedeSolicitarEliminacion && (
                            <button
                              type="button"
                              onClick={() => cancelarSolicitud(item)}
                              disabled={procesando}
                              className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50"
                            >
                              Restaurar
                            </button>
                          )}
                          {puedeEliminarDefinitivo && (
                            <button
                              type="button"
                              onClick={() => setConfirmacion({ tipo: "definitivo", item })}
                              disabled={procesando}
                              className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                            >
                              Eliminar definitivamente
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Buscador de muebles/modelos: filtra la lista al escribir y
              despliega solo los muebles cuyo componente coincidió. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-md">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar mueble, modelo, descripción o folio"
                autoComplete="off"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => desplegarTodos(true)}
              disabled={grupos.every((g) => g.totalHijos === 0)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
            >
              Desplegar todos
            </button>
            <button
              type="button"
              onClick={() => desplegarTodos(false)}
              disabled={grupos.every((g) => g.totalHijos === 0)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
            >
              Contraer todos
            </button>
            {busqueda.trim() && (
              <span className="text-sm text-slate-500">
                {grupos.length + sueltos.length} resultado(s)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Material
            </span>
            <button
              type="button"
              onClick={() => setFiltroMaterial(null)}
              className={`rounded-full border px-3 py-1 font-medium transition-colors ${
                filtroMaterial === null
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Todos
            </button>
            {MATERIALES.map((mat) => (
              <button
                key={mat}
                type="button"
                onClick={() => setFiltroMaterial(mat)}
                className={`rounded-full border px-3 py-1 font-medium transition-colors ${
                  filtroMaterial === mat
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {mat}
              </button>
            ))}
          </div>

          {/* Barra de acción masiva: sticky para no tener que subir hasta
              arriba en pedidos con muchos ítems después de seleccionar. */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 text-sm shadow-sm backdrop-blur">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={todosFiltradosSeleccionados}
                onChange={alternarSeleccionTodos}
                disabled={idsFiltrados.length === 0}
              />
              Seleccionar todos los filtrados ({idsFiltrados.length})
            </label>
            <span className="text-slate-500">{seleccionados.size} seleccionado(s)</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <a
                href={`/produccion/pedidos/${pedidoId}/viajero-lote?ids=${Array.from(seleccionados).join(",")}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (seleccionados.size === 0) e.preventDefault();
                }}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  seleccionados.size === 0
                    ? "pointer-events-none border-slate-200 text-slate-400"
                    : "border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white"
                }`}
              >
                Imprimir Selección (PDF)
              </a>
              <button
                type="button"
                onClick={revertirSeleccion}
                disabled={seleccionados.size === 0 || revirtiendo}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {revirtiendo ? "Revirtiendo..." : "Revertir Selección a Pendiente"}
              </button>
              <button
                type="button"
                onClick={liberarSeleccion}
                disabled={seleccionados.size === 0 || liberando}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                {liberando ? "Liberando..." : "Liberar Selección a Producción"}
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
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2">Imagen</th>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Modelo</th>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Descripción</th>
                    <th className="px-3 py-2">Cant.</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Folio</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                {/* Un <tbody> por mueble: su fila y, si está desplegado, sus
                    componentes; el borde superior los separa entre sí. */}
                {grupos.map((g) => (
                  <tbody
                    key={g.padre.id}
                    className="divide-y divide-slate-100 border-t border-slate-200 first:border-t-0"
                  >
                    <Fila item={g.padre} indentado={false} grupo={g} />
                    {estaAbierto(g) &&
                      g.hijos.map((f) => <Fila key={f.id} item={f} indentado />)}
                  </tbody>
                ))}
                {sueltos.length > 0 && (
                  <tbody className="divide-y divide-slate-100 border-t border-slate-200">
                    {sueltos.map((f) => (
                      <Fila key={f.id} item={f} indentado={false} />
                    ))}
                  </tbody>
                )}
              </table>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmacion !== null}
        title={
          confirmacion?.tipo === "definitivo"
            ? "Eliminar definitivamente"
            : "Enviar ítem a la papelera"
        }
        message={
          confirmacion?.tipo === "definitivo"
            ? `Esta acción NO se puede deshacer. ¿Eliminar definitivamente el ítem ${confirmacion.item.item_code}?`
            : `¿Enviar el ítem ${confirmacion?.item.item_code} a la papelera? Podrás restaurarlo desde ahí mientras nadie confirme la eliminación definitiva.${
                hijosDelItemAConfirmar > 0
                  ? ` Este ítem tiene ${hijosDelItemAConfirmar} componente(s) hijo, que se eliminarán junto con él al confirmarse.`
                  : ""
              }`
        }
        confirmLabel={
          confirmacion?.tipo === "definitivo" ? "Eliminar definitivamente" : "Enviar a papelera"
        }
        destructive
        onConfirm={confirmarAccionPendiente}
        onCancel={() => setConfirmacion(null)}
      />
    </div>
  );
}
