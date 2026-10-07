"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/avisos";
import DialogoMotivo from "@/components/dialogo-motivo";
import {
  colorFilaEstadoRevision,
  ESTADO_REVISION_LABELS,
  type EstadoRevision,
} from "@/lib/planeacion/estado-revision";
import { agruparParaDeshacer, type EstadoPrevio } from "@/lib/planeacion/cambio-estado-lote";
import {
  contarPorEstado,
  filtrarMuebles,
  materialesDe,
  padresConHijosCoincidentes,
  type EstadoFiltro,
  type FiltrosItems,
} from "@/lib/planeacion/filtrar-items";
import EstadoRevisionSelect from "./estado-revision-select";
import EliminarItemBoton from "./eliminar-item-boton";
import type { PlanoLink } from "@/lib/planos/planos-por-item";
import PlanosItem from "./planos-item";
import Chevron from "@/components/chevron";
import GrupoDesplegable from "@/components/grupo-desplegable";
import { useFlip } from "@/lib/ui/use-flip";

export interface ItemTabla {
  id: string;
  item_code: number;
  tipo_material: string | null;
  modelo: string | null;
  descripcion: string | null;
  unidad: string | null;
  cantidad_total: number;
  estado_revision: EstadoRevision;
  motivo_cancelacion: string | null;
}

export interface MuebleTabla extends ItemTabla {
  hijos: ItemTabla[];
}

async function patchLote(
  itemIds: string[],
  estado: EstadoRevision,
  motivo?: string
): Promise<{ error: string | null; actualizados: number }> {
  try {
    const res = await fetch("/api/planeacion/items/estado", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds, estado_revision: estado, motivo_cancelacion: motivo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "Error desconocido.", actualizados: 0 };
    return { error: null, actualizados: data.actualizados ?? itemIds.length };
  } catch {
    return { error: "Error de red. Intenta de nuevo.", actualizados: 0 };
  }
}

function textoLote(n: number, estado: EstadoRevision): string {
  const items = `${n} ítem${n === 1 ? "" : "s"}`;
  if (estado === "en_revision") return `${items} marcado${n === 1 ? "" : "s"} en revisión.`;
  if (estado === "cancelado") return `${items} cancelado${n === 1 ? "" : "s"}.`;
  return `${items} vuelto${n === 1 ? "" : "s"} a normal.`;
}

const CHIP_BASE =
  "rounded border px-3 py-1 text-sm font-medium transition-colors pointer-coarse:py-2";
const CHIP_ACTIVO = "border-brand-600 bg-brand-500 text-on-brand";
const CHIP_INACTIVO = "border-slate-200 text-slate-600 hover:bg-slate-50";

// Solo se muestran los ítems padre (ITEM entero); al hacer click en uno se
// despliegan sus componentes hijo (ITEM decimal). En pantallas angostas
// (celular, tablet vertical) modelo, material, descripción y cantidad se
// apilan en la celda del ítem, como en la tabla de Producción.
export default function ItemsTabla({
  muebles,
  imagenesPorItem,
  planosPorItem,
  puedeEditar,
  puedeEliminar,
  filtroInicial,
}: {
  muebles: MuebleTabla[];
  imagenesPorItem: Record<string, string[]>;
  planosPorItem: Record<string, PlanoLink[]>;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  filtroInicial: string;
}) {
  const tablaRef = useFlip<HTMLTableElement>();
  const router = useRouter();

  // --- Filtros: modelo (texto), material y estado de revisión ---
  const [filtro, setFiltro] = useState(filtroInicial);
  const [material, setMaterial] = useState<string | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("todos");
  const filtros = useMemo<FiltrosItems>(
    () => ({ texto: filtro.trim().toLowerCase(), material, estado: estadoFiltro }),
    [filtro, material, estadoFiltro]
  );
  const [expandidos, setExpandidos] = useState<Set<string>>(() =>
    padresConHijosCoincidentes(muebles, {
      texto: filtroInicial.trim().toLowerCase(),
      material: null,
      estado: "todos",
    })
  );
  const [imagenAbierta, setImagenAbierta] = useState<{ urls: string[]; indice: number } | null>(
    null
  );

  const materiales = useMemo(() => materialesDe(muebles), [muebles]);
  const conteoEstado = useMemo(() => contarPorEstado(muebles), [muebles]);
  const hayFiltros = !!(filtros.texto || filtros.material || filtros.estado !== "todos");

  // Al cambiar un filtro se abren solos los muebles con un componente que coincide.
  function aplicarFiltros(texto: string, mat: string | null, est: EstadoFiltro) {
    setFiltro(texto);
    setMaterial(mat);
    setEstadoFiltro(est);
    setExpandidos(
      padresConHijosCoincidentes(muebles, { texto: texto.trim().toLowerCase(), material: mat, estado: est })
    );
  }

  const visibles = useMemo(() => filtrarMuebles(muebles, filtros), [muebles, filtros]);

  // --- Cambio de estado en lote (solo quien puede editar) ---
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [cancelandoLote, setCancelandoLote] = useState(false);
  const [errorLote, setErrorLote] = useState<string | null>(null);

  const porId = useMemo(() => {
    const mapa = new Map<string, ItemTabla>();
    for (const m of muebles) {
      mapa.set(m.id, m);
      for (const h of m.hijos) mapa.set(h.id, h);
    }
    return mapa;
  }, [muebles]);
  // Todo lo que se ve con el filtro actual (mueble y sus componentes visibles).
  const idsVisibles = useMemo(
    () => visibles.flatMap(({ mueble, hijos }) => [mueble.id, ...hijos.map((h) => h.id)]),
    [visibles]
  );
  const todosMarcados = idsVisibles.length > 0 && idsVisibles.every((id) => seleccion.has(id));

  function marcar(ids: string[], marcado: boolean) {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      for (const id of ids) {
        if (marcado) siguiente.add(id);
        else siguiente.delete(id);
      }
      return siguiente;
    });
  }

  async function deshacerLote(previos: EstadoPrevio[]) {
    const { grupos, sinMotivo } = agruparParaDeshacer(previos);
    let fallidos = sinMotivo.length;
    for (const g of grupos) {
      const r = await patchLote(g.itemIds, g.estado, g.motivo ?? undefined);
      if (r.error) fallidos += g.itemIds.length;
    }
    if (fallidos === 0) avisar("Cambio deshecho.", "info");
    else avisar(`No se pudieron deshacer ${fallidos} de ${previos.length} ítems.`, "error");
    router.refresh();
  }

  async function aplicarLote(estado: EstadoRevision, motivo?: string) {
    // Solo se tocan los que de verdad cambian de estado.
    const aCambiar = [...seleccion].filter((id) => (porId.get(id)?.estado_revision ?? null) !== estado);
    if (aCambiar.length === 0) {
      setCancelandoLote(false);
      avisar("Los ítems elegidos ya tenían ese estado.", "info");
      return;
    }
    const previos: EstadoPrevio[] = aCambiar.map((id) => ({
      id,
      estado: porId.get(id)?.estado_revision ?? null,
      motivo: porId.get(id)?.motivo_cancelacion ?? null,
    }));
    setAplicando(true);
    setErrorLote(null);
    const r = await patchLote(aCambiar, estado, motivo);
    setAplicando(false);
    if (r.error) {
      setErrorLote(r.error);
      return;
    }
    setCancelandoLote(false);
    setSeleccion(new Set());
    avisar(textoLote(r.actualizados, estado), "exito", {
      etiqueta: "Deshacer",
      alHacer: () => deshacerLote(previos),
    });
    router.refresh();
  }

  function alternar(id: string) {
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  function abrirImagen(urls: string[], indice: number) {
    setImagenAbierta({ urls, indice });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filtro}
          onChange={(e) => aplicarFiltros(e.target.value, material, estadoFiltro)}
          placeholder="Buscar modelo en este pedido..."
          className="min-w-48 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand-600 focus:outline-none sm:py-2 sm:text-sm"
        />
        <button
          type="button"
          onClick={() => setExpandidos(new Set(muebles.map((m) => m.id)))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 sm:py-2"
        >
          Expandir todo
        </button>
        <button
          type="button"
          onClick={() => setExpandidos(new Set())}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 sm:py-2"
        >
          Contraer todo
        </button>
      </div>

      {(materiales.length > 1 || conteoEstado.enRevision > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {materiales.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Material</span>
              <button
                type="button"
                onClick={() => aplicarFiltros(filtro, null, estadoFiltro)}
                className={`${CHIP_BASE} ${material === null ? CHIP_ACTIVO : CHIP_INACTIVO}`}
              >
                Todos
              </button>
              {materiales.map((mat) => (
                <button
                  key={mat}
                  type="button"
                  onClick={() => aplicarFiltros(filtro, mat, estadoFiltro)}
                  className={`${CHIP_BASE} ${material === mat ? CHIP_ACTIVO : CHIP_INACTIVO}`}
                >
                  {mat}
                </button>
              ))}
            </div>
          )}
          {conteoEstado.enRevision > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</span>
              {(
                [
                  ["todos", "Todos"],
                  ["en_revision", `En revisión (${conteoEstado.enRevision})`],
                  ["normal", `Normales (${conteoEstado.normales})`],
                ] as [EstadoFiltro, string][]
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => aplicarFiltros(filtro, material, valor)}
                  className={`${CHIP_BASE} ${estadoFiltro === valor ? CHIP_ACTIVO : CHIP_INACTIVO}`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {puedeEditar && seleccion.size > 0 && (
        <div
          role="region"
          aria-label="Acciones sobre los ítems seleccionados"
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/95 p-3 text-sm shadow-sm backdrop-blur"
        >
          <span className="font-medium text-slate-800">
            {seleccion.size} seleccionado{seleccion.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => marcar(idsVisibles, !todosMarcados)}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            {todosMarcados ? "Quitar los visibles" : `Marcar los ${idsVisibles.length} visibles`}
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void aplicarLote("en_revision")}
              disabled={aplicando}
              className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 font-medium text-orange-800 transition-colors hover:bg-orange-100 disabled:opacity-50"
            >
              Marcar en revisión
            </button>
            <button
              type="button"
              onClick={() => void aplicarLote(null)}
              disabled={aplicando}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Volver a normal
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorLote(null);
                setCancelandoLote(true);
              }}
              disabled={aplicando}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
            >
              Cancelar…
            </button>
            <button
              type="button"
              onClick={() => setSeleccion(new Set())}
              className="px-2 py-2 text-slate-500 underline hover:text-slate-800"
            >
              Quitar selección
            </button>
          </div>
          {errorLote && !cancelandoLote && (
            <p role="alert" className="basis-full text-xs text-red-700">
              {errorLote}
            </p>
          )}
        </div>
      )}

      {cancelandoLote && (
        <DialogoMotivo
          titulo={`Cancelar ${seleccion.size} ítem${seleccion.size === 1 ? "" : "s"}`}
          descripcion="Quedan marcados como cancelados y se ven en Cancelados. Puedes deshacerlo."
          etiquetaConfirmar="Cancelar ítems"
          enviando={aplicando}
          error={errorLote}
          onConfirmar={(motivo) => void aplicarLote("cancelado", motivo)}
          onCancelar={() => setCancelandoLote(false)}
        />
      )}

      {visibles.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          {hayFiltros ? "Ningún ítem coincide con los filtros." : "Este pedido no tiene ítems."}
        </p>
      )}

      {visibles.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table ref={tablaRef} className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-6 py-2 pl-3"></th>
                {puedeEditar && (
                  <th className="w-8 px-2 py-2 sm:px-3">
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      onChange={() => marcar(idsVisibles, !todosMarcados)}
                      aria-label="Seleccionar todos los ítems visibles"
                      className="h-4 w-4 pointer-coarse:h-5 pointer-coarse:w-5"
                    />
                  </th>
                )}
                <th className="px-2 py-2 sm:px-3">Imagen</th>
                <th className="px-2 py-2 sm:px-3">Item</th>
                <th className="hidden px-3 py-2 lg:table-cell">Modelo</th>
                <th className="hidden px-3 py-2 lg:table-cell">Material</th>
                <th className="hidden px-3 py-2 lg:table-cell">Descripción</th>
                <th className="hidden px-3 py-2 lg:table-cell">Cant.</th>
                <th className="px-2 py-2 sm:px-3">Estado</th>
                {puedeEliminar && <th className="px-2 py-2 sm:px-3"></th>}
              </tr>
            </thead>
            {visibles.map(({ mueble: m, hijos }) => {
              const abierto = expandidos.has(m.id);
              return (
                <GrupoDesplegable key={m.id} abierto={abierto} total={hijos.length}>
                  {(mostrar) => (
                    <>
                      <tr
                        data-flip={m.id}
                        onClick={() => alternar(m.id)}
                        aria-expanded={abierto}
                        className={`cursor-pointer border-t border-slate-200 align-top text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 ${abierto ? "fila-padre-abierta" : ""} ${
                          seleccion.has(m.id) ? "bg-brand-50" : colorFilaEstadoRevision(m.estado_revision)
                        }`}
                      >
                        <td className="py-2 pl-3 text-slate-500">
                          {hijos.length > 0 && <Chevron abierto={abierto} />}
                        </td>
                        {puedeEditar && (
                          <td className="px-2 py-2 sm:px-3" onClick={(e) => e.stopPropagation()}>
                            {/* Marcar un mueble marca también sus componentes visibles. */}
                            <input
                              type="checkbox"
                              checked={seleccion.has(m.id)}
                              onChange={() =>
                                marcar([m.id, ...hijos.map((h) => h.id)], !seleccion.has(m.id))
                              }
                              aria-label={`Seleccionar ítem ${m.item_code}`}
                              className="h-4 w-4 pointer-coarse:h-5 pointer-coarse:w-5"
                            />
                          </td>
                        )}
                        <td className="px-2 py-2 sm:px-3">
                          <ImagenesItem urls={imagenesPorItem[m.id] ?? []} onAbrir={abrirImagen} />
                        </td>
                        <td className="px-2 py-2 sm:px-3">
                          {m.item_code}
                          <DatosApilados
                            item={m}
                            planos={planosPorItem[m.id] ?? []}
                            componentes={hijos.length}
                          />
                        </td>
                        <td className="hidden px-3 py-2 lg:table-cell">
                          {m.modelo}
                          <PlanosItem planos={planosPorItem[m.id] ?? []} />
                        </td>
                        <td className="hidden px-3 py-2 lg:table-cell">{m.tipo_material}</td>
                        <td className="hidden px-3 py-2 lg:table-cell">
                          {m.descripcion}
                          {hijos.length > 0 && (
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              ({hijos.length} componentes)
                            </span>
                          )}
                        </td>
                        <td className="hidden px-3 py-2 lg:table-cell">
                          {m.cantidad_total} {m.unidad}
                        </td>
                        <td className="px-2 py-2 sm:px-3" onClick={(e) => e.stopPropagation()}>
                          <EstadoCelda item={m} puedeEditar={puedeEditar} />
                        </td>
                        {puedeEliminar && (
                          <td className="px-2 py-2 sm:px-3" onClick={(e) => e.stopPropagation()}>
                            <EliminarItemBoton itemId={m.id} />
                          </td>
                        )}
                      </tr>
                      {mostrar &&
                        hijos.map((f, i) => (
                          <tr
                            key={f.id}
                            data-flip={f.id}
                            style={{ "--i": i } as React.CSSProperties}
                            className={`fila-hija border-t border-slate-100 align-top text-slate-700 transition-colors hover:bg-slate-50 ${
                              seleccion.has(f.id) ? "bg-brand-50" : colorFilaEstadoRevision(f.estado_revision)
                            }`}
                          >
                            <td className="guia-hija"></td>
                            {puedeEditar && (
                              <td className="px-2 py-2 sm:px-3">
                                <input
                                  type="checkbox"
                                  checked={seleccion.has(f.id)}
                                  onChange={() => marcar([f.id], !seleccion.has(f.id))}
                                  aria-label={`Seleccionar ítem ${f.item_code}`}
                                  className="h-4 w-4 pointer-coarse:h-5 pointer-coarse:w-5"
                                />
                              </td>
                            )}
                            <td className="py-2 pr-2 pl-3 sm:pr-3 sm:pl-6">
                              <ImagenesItem urls={imagenesPorItem[f.id] ?? []} onAbrir={abrirImagen} />
                            </td>
                            <td className="py-2 pr-2 pl-2 sm:pr-3 sm:pl-6">
                              {f.item_code}
                              <DatosApilados item={f} planos={planosPorItem[f.id] ?? []} componentes={0} corto />
                            </td>
                            <td className="hidden px-3 py-2 lg:table-cell">
                              {f.modelo}
                              <PlanosItem planos={planosPorItem[f.id] ?? []} />
                            </td>
                            <td className="hidden px-3 py-2 lg:table-cell">{f.tipo_material}</td>
                            <td className="hidden px-3 py-2 lg:table-cell">{f.descripcion?.split("\n")[0]}</td>
                            <td className="hidden px-3 py-2 lg:table-cell">
                              {f.cantidad_total} {f.unidad}
                            </td>
                            <td className="px-2 py-2 sm:px-3">
                              <EstadoCelda item={f} puedeEditar={puedeEditar} />
                            </td>
                            {puedeEliminar && (
                              <td className="px-2 py-2 sm:px-3">
                                <EliminarItemBoton itemId={f.id} />
                              </td>
                            )}
                          </tr>
                        ))}
                    </>
                  )}
                </GrupoDesplegable>
              );
            })}
          </table>
        </div>
      )}

      {imagenAbierta && (
        <VisorImagen
          urls={imagenAbierta.urls}
          indice={imagenAbierta.indice}
          onCambiar={(indice) => setImagenAbierta({ ...imagenAbierta, indice })}
          onCerrar={() => setImagenAbierta(null)}
        />
      )}
    </div>
  );
}

// Modelo, plano, descripción, cantidad y material en la celda del ítem, solo en
// pantallas angostas (en escritorio cada dato tiene su columna).
function DatosApilados({
  item,
  planos,
  componentes,
  corto = false,
}: {
  item: ItemTabla;
  planos: PlanoLink[];
  componentes: number;
  // Un componente muestra solo la primera línea de su descripción.
  corto?: boolean;
}) {
  const descripcion = corto ? item.descripcion?.split("\n")[0] : item.descripcion;
  return (
    <div className="mt-1 flex flex-col gap-1 text-xs font-normal text-slate-700 lg:hidden">
      {item.modelo && <span className="font-medium text-slate-900">{item.modelo}</span>}
      <PlanosItem planos={planos} />
      {descripcion && <p className={corto ? "line-clamp-2" : "line-clamp-3"}>{descripcion}</p>}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500">
        <span className="font-medium text-slate-700">
          {item.cantidad_total} {item.unidad}
        </span>
        {item.tipo_material && <span>{item.tipo_material}</span>}
        {componentes > 0 && (
          <span>
            {componentes} componente{componentes === 1 ? "" : "s"}
          </span>
        )}
      </p>
    </div>
  );
}

function EstadoCelda({ item, puedeEditar }: { item: ItemTabla; puedeEditar: boolean }) {
  if (puedeEditar) {
    return (
      <EstadoRevisionSelect
        itemId={item.id}
        estadoActual={item.estado_revision}
        motivoActual={item.motivo_cancelacion}
        etiqueta={`Ítem ${item.item_code}`}
      />
    );
  }
  if (!item.estado_revision) return <span className="text-slate-500">—</span>;
  return <span>{ESTADO_REVISION_LABELS[item.estado_revision]}</span>;
}

function ImagenesItem({
  urls,
  onAbrir,
}: {
  urls: string[];
  onAbrir: (urls: string[], indice: number) => void;
}) {
  if (urls.length === 0) return null;
  return (
    <div className="flex gap-1">
      {urls.map((url, indice) => (
        <button
          key={url}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAbrir(urls, indice);
          }}
          className="cursor-zoom-in"
          title="Ver imagen"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- imágenes en bucket privado vía signed URL, no next/image */}
          <img src={url} alt="" loading="lazy" decoding="async" className="h-10 w-10 rounded border border-slate-200 object-cover" />
        </button>
      ))}
    </div>
  );
}

function VisorImagen({
  urls,
  indice,
  onCambiar,
  onCerrar,
}: {
  urls: string[];
  indice: number;
  onCambiar: (indice: number) => void;
  onCerrar: () => void;
}) {
  const hayVarias = urls.length > 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
      if (hayVarias && e.key === "ArrowRight") onCambiar((indice + 1) % urls.length);
      if (hayVarias && e.key === "ArrowLeft") onCambiar((indice - 1 + urls.length) % urls.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [indice, urls.length, hayVarias, onCambiar, onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCerrar}
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- imágenes en bucket privado vía signed URL, no next/image */}
      <img
        src={urls[indice]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-[min(90vw,40rem)] rounded bg-papel object-contain shadow-lg"
      />
      <button
        type="button"
        onClick={onCerrar}
        className="absolute top-4 right-4 rounded bg-white/90 px-3 py-1 text-sm font-medium"
      >
        Cerrar ✕
      </button>
      {hayVarias && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCambiar((indice - 1 + urls.length) % urls.length);
            }}
            className="absolute left-4 rounded bg-white/90 px-3 py-2 text-lg"
            aria-label="Imagen anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCambiar((indice + 1) % urls.length);
            }}
            className="absolute right-4 rounded bg-white/90 px-3 py-2 text-lg"
            aria-label="Imagen siguiente"
          >
            ›
          </button>
          <span className="absolute bottom-4 rounded bg-white/90 px-2 py-1 text-xs">
            {indice + 1} / {urls.length}
          </span>
        </>
      )}
    </div>
  );
}
