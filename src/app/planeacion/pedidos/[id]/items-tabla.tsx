"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
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
import GrupoDesplegable from "@/components/grupo-desplegable";
import BotonDesplegar from "@/components/boton-desplegar";
import Chevron from "@/components/chevron";
import ImagenAmpliable from "@/components/imagen-ampliable";
import type { ImagenItemUrls } from "@/lib/planeacion/imagenes";
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

// Cuántos muebles se dibujan a la vez: con miles de filas la pantalla se pone
// lenta. Los filtros siguen buscando en todos; el botón de abajo muestra más.
const MUEBLES_POR_PAGINA = 100;

const CHIP_BASE =
  "rounded border px-3 py-1 text-sm font-medium transition-colors pointer-coarse:py-2";
const CHIP_ACTIVO = "border-brand-600 bg-brand-500 text-on-brand";
const CHIP_INACTIVO = "border-slate-200 text-slate-600 hover:bg-slate-50";

// Solo se muestran los muebles (ítem entero); al tocar uno se despliegan sus componentes (ítem
// decimal). En escritorio es una tabla; en celular y tablet vertical, una lista de tarjetas con lo
// mismo: seleccionar, cambiar el estado, enviar a la papelera, planos y ver componentes.
export default function ItemsTabla({
  muebles,
  imagenesPorItem,
  planosPorItem,
  puedeEditar,
  puedeEliminar,
  filtroInicial,
}: {
  muebles: MuebleTabla[];
  imagenesPorItem: Record<string, ImagenItemUrls[]>;
  planosPorItem: Record<string, PlanoLink[]>;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  filtroInicial: string;
}) {
  const tablaRef = useFlip<HTMLTableElement>();
  // En pantallas angostas (celular, tablet vertical) cada mueble es una tarjeta; desde 1024 px, la tabla.
  const esEscritorio = useEsEscritorio();
  const router = useRouter();

  // --- Filtros: modelo (texto), material y estado de revisión ---
  const [filtro, setFiltro] = useState(filtroInicial);
  const [material, setMaterial] = useState<string | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("todos");
  const [limite, setLimite] = useState(MUEBLES_POR_PAGINA);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
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

  const materiales = useMemo(() => materialesDe(muebles), [muebles]);
  const conteoEstado = useMemo(() => contarPorEstado(muebles), [muebles]);
  const hayFiltros = !!(filtros.texto || filtros.material || filtros.estado !== "todos");
  // Material y estado van en un panel plegado; el contador del botón dice cuántos hay puestos.
  const hayFiltrosDisponibles = materiales.length > 1 || conteoEstado.enRevision > 0;
  const filtrosActivos = (material ? 1 : 0) + (estadoFiltro !== "todos" ? 1 : 0);
  const hayComponentes = useMemo(() => muebles.some((m) => m.hijos.length > 0), [muebles]);

  // Al cambiar un filtro se abren solos los muebles con un componente que coincide.
  function aplicarFiltros(texto: string, mat: string | null, est: EstadoFiltro) {
    setFiltro(texto);
    setMaterial(mat);
    setEstadoFiltro(est);
    setLimite(MUEBLES_POR_PAGINA);
    setExpandidos(
      padresConHijosCoincidentes(muebles, { texto: texto.trim().toLowerCase(), material: mat, estado: est })
    );
  }

  const visibles = useMemo(() => filtrarMuebles(muebles, filtros), [muebles, filtros]);
  // Los que se dibujan ahora (los primeros `limite`).
  const enPantalla = useMemo(() => visibles.slice(0, limite), [visibles, limite]);

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
  // Todo lo que se ve en pantalla (mueble y sus componentes visibles).
  const idsVisibles = useMemo(
    () => enPantalla.flatMap(({ mueble, hijos }) => [mueble.id, ...hijos.map((h) => h.id)]),
    [enPantalla]
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
        {hayFiltrosDisponibles && (
          <button
            type="button"
            onClick={() => setFiltrosAbiertos((a) => !a)}
            aria-expanded={filtrosAbiertos}
            className={`rounded-lg border px-3 py-2.5 text-sm shadow-sm sm:py-2 ${
              filtrosActivos > 0
                ? "border-brand-600 bg-brand-50 font-medium text-brand-800"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Filtrar{filtrosActivos > 0 ? ` (${filtrosActivos})` : ""}
          </button>
        )}
        {hayComponentes && (
          <button
            type="button"
            onClick={() => setExpandidos(expandidos.size > 0 ? new Set() : new Set(muebles.map((m) => m.id)))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 sm:py-2"
          >
            {expandidos.size > 0 ? "Ocultar componentes" : "Mostrar componentes"}
          </button>
        )}
      </div>

      {hayFiltrosDisponibles && filtrosAbiertos && (
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
              Poner en revisión
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
              Cancelar seleccionados…
            </button>
            <button
              type="button"
              onClick={() => setSeleccion(new Set())}
              className="px-2 py-2 text-slate-500 underline hover:text-slate-800"
            >
              Deseleccionar
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
          descripcion="Quedan marcados como cancelados y se ven en Archivo. Puedes deshacerlo."
          etiquetaConfirmar="Cancelar ítems"
          enviando={aplicando}
          error={errorLote}
          onConfirmar={(motivo) => void aplicarLote("cancelado", motivo)}
          onCancelar={() => setCancelandoLote(false)}
        />
      )}

      {puedeEditar && visibles.length > 0 && (
        <p className="text-xs text-slate-500">
          Toca un mueble para ver sus componentes. Marca las casillas para cambiar varios a la vez.
        </p>
      )}

      {visibles.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          <p>{hayFiltros ? "Ningún mueble coincide con lo que buscas." : "Este pedido todavía no tiene muebles."}</p>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => aplicarFiltros("", null, "todos")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Quitar filtros
            </button>
          )}
        </div>
      )}

      {visibles.length > 0 &&
        (esEscritorio ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table ref={tablaRef} className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-6 py-2 pl-3"></th>
                {puedeEditar && (
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      onChange={() => marcar(idsVisibles, !todosMarcados)}
                      aria-label="Seleccionar todos los ítems visibles"
                      className="h-4 w-4"
                    />
                  </th>
                )}
                <th className="px-3 py-2">Imagen</th>
                <th className="px-3 py-2">N.º</th>
                <th className="px-3 py-2">Modelo</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2">Cantidad</th>
                <th className="px-3 py-2">Estado</th>
                {puedeEliminar && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            {enPantalla.map(({ mueble: m, hijos }) => {
              const abierto = expandidos.has(m.id);
              return (
                <GrupoDesplegable key={m.id} abierto={abierto} total={hijos.length}>
                  {(mostrar) => (
                    <>
                      <tr
                        data-flip={m.id}
                        onClick={() => alternar(m.id)}
                        className={`cursor-pointer border-t border-slate-200 align-top text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 ${abierto ? "fila-padre-abierta" : ""} ${
                          seleccion.has(m.id) ? "bg-brand-50" : colorFilaEstadoRevision(m.estado_revision)
                        }`}
                      >
                        <td className="py-2 pl-3 text-slate-500">
                          {hijos.length > 0 && (
                            <BotonDesplegar
                              abierto={abierto}
                              alAlternar={() => alternar(m.id)}
                              descripcion={`los ${hijos.length} componente${hijos.length === 1 ? "" : "s"} del ítem ${m.item_code}`}
                              className="h-4 w-4"
                            />
                          )}
                        </td>
                        {puedeEditar && (
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            {/* Marcar un mueble marca también sus componentes visibles. */}
                            <input
                              type="checkbox"
                              checked={seleccion.has(m.id)}
                              onChange={() =>
                                marcar([m.id, ...hijos.map((h) => h.id)], !seleccion.has(m.id))
                              }
                              aria-label={`Seleccionar ítem ${m.item_code}`}
                              className="h-4 w-4"
                            />
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <ImagenesMueble imagenes={imagenesPorItem[m.id] ?? []} etiqueta={`Ítem ${m.item_code}`} />
                        </td>
                        <td className="px-3 py-2">{m.item_code}</td>
                        <td className="px-3 py-2">
                          {m.modelo}
                          <PlanosItem planos={planosPorItem[m.id] ?? []} />
                        </td>
                        <td className="px-3 py-2">{m.descripcion}</td>
                        <td className="px-3 py-2">
                          {m.cantidad_total} {m.unidad}
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <EstadoCelda item={m} puedeEditar={puedeEditar} />
                        </td>
                        {puedeEliminar && (
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={seleccion.has(f.id)}
                                  onChange={() => marcar([f.id], !seleccion.has(f.id))}
                                  aria-label={`Seleccionar ítem ${f.item_code}`}
                                  className="h-4 w-4"
                                />
                              </td>
                            )}
                            <td className="py-2 pr-3 pl-6">
                              <ImagenesMueble imagenes={imagenesPorItem[f.id] ?? []} etiqueta={`Ítem ${f.item_code}`} />
                            </td>
                            <td className="px-3 py-2">{f.item_code}</td>
                            <td className="px-3 py-2">
                              {f.modelo}
                              <PlanosItem planos={planosPorItem[f.id] ?? []} />
                            </td>
                            <td className="px-3 py-2">{f.descripcion?.split("\n")[0]}</td>
                            <td className="px-3 py-2">
                              {f.cantidad_total} {f.unidad}
                            </td>
                            <td className="px-3 py-2">
                              <EstadoCelda item={f} puedeEditar={puedeEditar} />
                            </td>
                            {puedeEliminar && (
                              <td className="px-3 py-2">
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
        ) : (
        <div className="flex flex-col gap-3">
          {puedeEditar && (
            <label className="flex min-h-10 w-fit items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={todosMarcados}
                onChange={() => marcar(idsVisibles, !todosMarcados)}
                className="h-5 w-5"
              />
              Seleccionar todos los visibles
            </label>
          )}
          <ul className="flex flex-col gap-3">
            {enPantalla.map(({ mueble: m, hijos }) => {
              const abierto = expandidos.has(m.id);
              return (
                <li key={m.id} className="flex flex-col gap-2">
                  <TarjetaItem
                    item={m}
                    planos={planosPorItem[m.id] ?? []}
                    imagenes={imagenesPorItem[m.id] ?? []}
                    seleccionado={seleccion.has(m.id)}
                    onMarcar={() => marcar([m.id, ...hijos.map((h) => h.id)], !seleccion.has(m.id))}
                    puedeEditar={puedeEditar}
                    puedeEliminar={puedeEliminar}
                    componentes={hijos.length}
                    abierto={abierto}
                    onAlternar={() => alternar(m.id)}
                  />
                  {abierto && hijos.length > 0 && (
                    <ul className="ml-3 flex flex-col gap-2 border-l-2 border-slate-200 pl-3">
                      {hijos.map((f) => (
                        <li key={f.id}>
                          <TarjetaItem
                            item={f}
                            planos={planosPorItem[f.id] ?? []}
                            imagenes={imagenesPorItem[f.id] ?? []}
                            seleccionado={seleccion.has(f.id)}
                            onMarcar={() => marcar([f.id], !seleccion.has(f.id))}
                            puedeEditar={puedeEditar}
                            puedeEliminar={puedeEliminar}
                            componentes={0}
                            abierto={false}
                            onAlternar={() => {}}
                            corto
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        ))}

      {visibles.length > enPantalla.length && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <p>
            Mostrando {enPantalla.length} de {visibles.length} muebles
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLimite((l) => l + MUEBLES_POR_PAGINA)}
              className={`${CHIP_BASE} ${CHIP_INACTIVO}`}
            >
              Mostrar {Math.min(MUEBLES_POR_PAGINA, visibles.length - enPantalla.length)} más
            </button>
            <button type="button" onClick={() => setLimite(visibles.length)} className={`${CHIP_BASE} ${CHIP_INACTIVO}`}>
              Mostrar todos
            </button>
          </div>
        </div>
      )}

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
        etiqueta={`N.º ${item.item_code}`}
      />
    );
  }
  if (!item.estado_revision) return <span className="text-slate-500">—</span>;
  return <span>{ESTADO_REVISION_LABELS[item.estado_revision]}</span>;
}

// Tarjeta de un mueble o componente en pantallas angostas. Lleva lo mismo que una fila de la tabla.
function TarjetaItem({
  item,
  planos,
  imagenes,
  seleccionado,
  onMarcar,
  puedeEditar,
  puedeEliminar,
  componentes,
  abierto,
  onAlternar,
  corto = false,
}: {
  item: ItemTabla;
  planos: PlanoLink[];
  imagenes: ImagenItemUrls[];
  seleccionado: boolean;
  onMarcar: () => void;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  // Cuántos componentes tiene (0 en un componente o un mueble sin ellos).
  componentes: number;
  abierto: boolean;
  onAlternar: () => void;
  // Un componente muestra solo la primera línea de su descripción.
  corto?: boolean;
}) {
  const descripcion = corto ? item.descripcion?.split("\n")[0] : item.descripcion;
  const fondo = seleccionado ? "bg-brand-50" : colorFilaEstadoRevision(item.estado_revision) || "bg-white";
  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-slate-200 p-3 shadow-sm ${fondo}`}>
      <div className="flex items-start gap-3">
        {puedeEditar && (
          <input
            type="checkbox"
            checked={seleccionado}
            onChange={onMarcar}
            aria-label={`Seleccionar ítem ${item.item_code}`}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
        )}
        <ImagenesMueble imagenes={imagenes} etiqueta={`Ítem ${item.item_code}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            N.º {item.item_code}
            {item.modelo && <span className="ml-2 font-medium text-slate-700">{item.modelo}</span>}
          </p>
          {descripcion && (
            <p className={`mt-0.5 text-sm text-slate-700 ${corto ? "line-clamp-2" : "line-clamp-3"}`}>{descripcion}</p>
          )}
          <p className="mt-1 text-xs font-medium text-slate-700">
            {item.cantidad_total} {item.unidad}
          </p>
          <PlanosItem planos={planos} />
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-40 flex-1 [&_select]:w-full">
          <EstadoCelda item={item} puedeEditar={puedeEditar} />
        </div>
        {puedeEliminar && <EliminarItemBoton itemId={item.id} />}
      </div>
      {componentes > 0 && (
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierto}
          className="inline-flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white/70 px-3 text-sm font-medium text-slate-700 hover:bg-white"
        >
          {abierto ? "Ocultar componentes" : "Ver componentes"}
          <Chevron abierto={abierto} className="h-4 w-4 text-slate-500" />
        </button>
      )}
    </div>
  );
}

// Miniaturas del mueble o componente; al tocarlas se amplían con zoom (rueda, arrastrar, +/−).
// Sin imagen queda un recuadro gris del mismo tamaño, para que no parezca que algo falló.
function ImagenesMueble({ imagenes, etiqueta }: { imagenes: ImagenItemUrls[]; etiqueta: string }) {
  if (imagenes.length === 0) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-center text-[9px] leading-tight text-slate-400">
        Sin imagen
      </div>
    );
  }
  return (
    <div className="flex gap-1">
      {imagenes.map((img) => (
        <ImagenAmpliable key={img.url} url={img.url} urlGrande={img.urlGrande} alt={etiqueta} />
      ))}
    </div>
  );
}

// true desde 1024 px de ancho (la tabla cabe); antes de hidratar se asume escritorio.
function useEsEscritorio(): boolean {
  return useSyncExternalStore(
    (alCambiar) => {
      const consulta = window.matchMedia("(min-width: 1024px)");
      consulta.addEventListener("change", alCambiar);
      return () => consulta.removeEventListener("change", alCambiar);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true
  );
}
