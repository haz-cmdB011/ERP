"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConfirmDialog from "@/components/confirm-dialog";
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
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [liberando, setLiberando] = useState(false);
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  // Un ítem con eliminación solicitada sale de la lista normal y vive solo
  // en la Papelera hasta que se restaure o se elimine definitivamente.
  const itemsActivos = useMemo(() => items.filter((i) => !i.eliminacion_solicitada_en), [items]);
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

  const idsFiltrados = useMemo(() => itemsFiltrados.map((i) => i.id), [itemsFiltrados]);
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

  // Agrupación visual MO -> FU (los MO sin hijos se muestran solos).
  const mo = itemsFiltrados.filter((i) => i.tipo_registro === "MO");
  const fuPorPadre = new Map<string, ItemLiberacionRow[]>();
  const idsEnGrupos = new Set<string>();
  for (const item of itemsFiltrados) {
    if (item.tipo_registro === "FU" && item.parent_item_id) {
      const lista = fuPorPadre.get(item.parent_item_id) ?? [];
      lista.push(item);
      fuPorPadre.set(item.parent_item_id, lista);
    }
  }
  for (const m of mo) {
    idsEnGrupos.add(m.id);
    for (const f of fuPorPadre.get(m.id) ?? []) idsEnGrupos.add(f.id);
  }
  // FU huérfanos dentro del filtro actual (su MO padre quedó fuera del filtro).
  const fuSueltos = itemsFiltrados.filter(
    (i) => i.tipo_registro === "FU" && !idsEnGrupos.has(i.id)
  );

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
    const { error } = await supabase.rpc("eliminar_item_definitivo", { p_item_id: item.id });
    setProcesandoId(null);
    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
      return;
    }
    setMensaje({ tipo: "ok", texto: `Ítem ${item.item_code} eliminado definitivamente.` });
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
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
          Enviado a Producción
        </span>
      );
    }
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
        Pendiente
      </span>
    );
  }

  function Fila({ item, indentado }: { item: ItemLiberacionRow; indentado: boolean }) {
    const procesando = procesandoId === item.id;

    return (
      <tr
        className={`${indentado ? "border-t border-gray-100" : "text-sm font-medium"} ${colorFilaEstadoRevision(item.estado_revision)}`}
      >
        <td className="py-1 pr-2">
          <input
            type="checkbox"
            checked={seleccionados.has(item.id)}
            onChange={() => alternarSeleccion(item.id)}
            aria-label={`Seleccionar ítem ${item.item_code}`}
          />
        </td>
        <td className="py-1 pr-2">{item.item_code}</td>
        <td className="py-1 pr-2">{item.modelo}</td>
        <td className="py-1 pr-2">{item.tipo_material}</td>
        <td className="py-1 pr-2">
          {indentado ? item.descripcion?.split("\n")[0] : item.descripcion}
        </td>
        <td className="py-1 pr-2">
          {item.cantidad_total} {item.unidad}
        </td>
        <td className="py-1 pr-2">
          <EstadoBadge item={item} />
          {item.estado_revision && (
            <span className="mt-1 block text-xs font-semibold">
              {ESTADO_REVISION_LABELS[item.estado_revision]} (Planeación)
            </span>
          )}
        </td>
        <td className="flex flex-wrap gap-2 py-1 pr-2">
          <Link
            href={`/produccion/pedidos/${pedidoId}/viajero/${item.id}`}
            className="underline"
          >
            Viajero
          </Link>
          {puedeSolicitarEliminacion && (
            <button
              type="button"
              onClick={() => setConfirmacion({ tipo: "solicitar", item })}
              disabled={procesando}
              className="text-red-700 underline disabled:opacity-50"
            >
              Eliminar
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
            className={`rounded border px-3 py-1 ${
              !vistaPapelera && filtroEstado === valor
                ? "border-black bg-black text-white"
                : "border-gray-300 text-gray-700"
            }`}
          >
            {etiqueta}
          </button>
        ))}
        {(puedeSolicitarEliminacion || puedeEliminarDefinitivo) && (
          <button
            type="button"
            onClick={() => setVistaPapelera((v) => !v)}
            className={`ml-auto rounded border px-3 py-1 ${
              vistaPapelera ? "border-red-700 bg-red-700 text-white" : "border-red-300 text-red-700"
            }`}
          >
            Papelera ({itemsPapelera.length})
          </button>
        )}
      </div>

      {mensaje && (
        <div
          className={`rounded border p-3 text-sm ${
            mensaje.tipo === "ok"
              ? "border-green-300 bg-green-50 text-green-800"
              : "border-red-300 bg-red-50 text-red-800"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {vistaPapelera ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Ítems con eliminación solicitada. Se pueden restaurar mientras no se confirme la
            eliminación definitiva.
          </p>
          {itemsPapelera.length === 0 ? (
            <p className="text-sm text-gray-600">La papelera está vacía.</p>
          ) : (
            <div className="rounded border border-gray-200 p-3">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="py-1 pr-2">Item</th>
                    <th className="py-1 pr-2">Modelo</th>
                    <th className="py-1 pr-2">Material</th>
                    <th className="py-1 pr-2">Descripción</th>
                    <th className="py-1 pr-2">Cant.</th>
                    <th className="py-1 pr-2">Eliminado</th>
                    <th className="py-1 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {itemsPapelera.map((item) => {
                    const procesando = procesandoId === item.id;
                    return (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="py-1 pr-2">{item.item_code}</td>
                        <td className="py-1 pr-2">{item.modelo}</td>
                        <td className="py-1 pr-2">{item.tipo_material}</td>
                        <td className="py-1 pr-2">{item.descripcion}</td>
                        <td className="py-1 pr-2">
                          {item.cantidad_total} {item.unidad}
                        </td>
                        <td className="py-1 pr-2 text-gray-500">
                          {new Date(item.eliminacion_solicitada_en as string).toLocaleDateString()}
                        </td>
                        <td className="flex flex-wrap gap-2 py-1 pr-2">
                          {puedeSolicitarEliminacion && (
                            <button
                              type="button"
                              onClick={() => cancelarSolicitud(item)}
                              disabled={procesando}
                              className="text-black underline disabled:opacity-50"
                            >
                              Restaurar
                            </button>
                          )}
                          {puedeEliminarDefinitivo && (
                            <button
                              type="button"
                              onClick={() => setConfirmacion({ tipo: "definitivo", item })}
                              disabled={procesando}
                              className="text-red-700 underline disabled:opacity-50"
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
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500">Material:</span>
            <button
              type="button"
              onClick={() => setFiltroMaterial(null)}
              className={`rounded border px-2 py-1 ${
                filtroMaterial === null ? "border-black bg-black text-white" : "border-gray-300 text-gray-700"
              }`}
            >
              Todos
            </button>
            {MATERIALES.map((mat) => (
              <button
                key={mat}
                type="button"
                onClick={() => setFiltroMaterial(mat)}
                className={`rounded border px-2 py-1 ${
                  filtroMaterial === mat ? "border-black bg-black text-white" : "border-gray-300 text-gray-700"
                }`}
              >
                {mat}
              </button>
            ))}
          </div>

          {/* Barra de acción masiva */}
          <div className="flex flex-wrap items-center gap-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={todosFiltradosSeleccionados}
                onChange={alternarSeleccionTodos}
                disabled={idsFiltrados.length === 0}
              />
              Seleccionar todos los filtrados ({idsFiltrados.length})
            </label>
            <span className="text-gray-500">{seleccionados.size} seleccionado(s)</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <a
                href={`/produccion/pedidos/${pedidoId}/viajero-lote?ids=${Array.from(seleccionados).join(",")}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (seleccionados.size === 0) e.preventDefault();
                }}
                className={`rounded border px-3 py-2 text-sm font-medium ${
                  seleccionados.size === 0
                    ? "pointer-events-none border-gray-200 text-gray-400"
                    : "border-black text-black hover:bg-black hover:text-white"
                }`}
              >
                Imprimir Selección (PDF)
              </a>
              <button
                type="button"
                onClick={revertirSeleccion}
                disabled={seleccionados.size === 0 || revirtiendo}
                className="rounded border border-black px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
              >
                {revirtiendo ? "Revirtiendo..." : "Revertir Selección a Pendiente"}
              </button>
              <button
                type="button"
                onClick={liberarSeleccion}
                disabled={seleccionados.size === 0 || liberando}
                className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {liberando ? "Liberando..." : "Liberar Selección a Producción"}
              </button>
            </div>
          </div>

          {itemsFiltrados.length === 0 && (
            <p className="text-sm text-gray-600">Ningún ítem coincide con el filtro seleccionado.</p>
          )}

          {(mo.length > 0 || fuSueltos.length > 0) && (
            <div className="flex flex-col gap-4">
              {mo.map((m) => (
                <div key={m.id} className="rounded border border-gray-200 p-3">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="py-1 pr-2"></th>
                        <th className="py-1 pr-2">Item</th>
                        <th className="py-1 pr-2">Modelo</th>
                        <th className="py-1 pr-2">Material</th>
                        <th className="py-1 pr-2">Descripción</th>
                        <th className="py-1 pr-2">Cant.</th>
                        <th className="py-1 pr-2">Estado</th>
                        <th className="py-1 pr-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <Fila item={m} indentado={false} />
                      {(fuPorPadre.get(m.id) ?? []).map((f) => (
                        <Fila key={f.id} item={f} indentado />
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {fuSueltos.length > 0 && (
                <div className="rounded border border-gray-200 p-3">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="py-1 pr-2"></th>
                        <th className="py-1 pr-2">Item</th>
                        <th className="py-1 pr-2">Modelo</th>
                        <th className="py-1 pr-2">Material</th>
                        <th className="py-1 pr-2">Descripción</th>
                        <th className="py-1 pr-2">Cant.</th>
                        <th className="py-1 pr-2">Estado</th>
                        <th className="py-1 pr-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fuSueltos.map((f) => (
                        <Fila key={f.id} item={f} indentado={false} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
            : `¿Seguro que quieres eliminar el ítem ${confirmacion?.item.item_code}? Se moverá a la papelera y podrás restaurarlo mientras nadie confirme la eliminación definitiva.${
                hijosDelItemAConfirmar > 0
                  ? ` Este ítem tiene ${hijosDelItemAConfirmar} componente(s) hijo, que se eliminarán junto con él al confirmarse.`
                  : ""
              }`
        }
        confirmLabel={confirmacion?.tipo === "definitivo" ? "Eliminar definitivamente" : "Eliminar"}
        destructive
        onConfirm={confirmarAccionPendiente}
        onCancel={() => setConfirmacion(null)}
      />
    </div>
  );
}
