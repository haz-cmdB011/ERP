"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  colorFilaEstadoRevision,
  ESTADO_REVISION_LABELS,
  type EstadoRevision,
} from "@/lib/planeacion/estado-revision";
import EstadoRevisionSelect from "./estado-revision-select";

export interface ItemTabla {
  id: string;
  item_code: number;
  tipo_material: string | null;
  modelo: string | null;
  descripcion: string | null;
  unidad: string | null;
  cantidad_total: number;
  estado_revision: EstadoRevision;
}

export interface MuebleTabla extends ItemTabla {
  hijos: ItemTabla[];
}

function coincide(item: ItemTabla, filtro: string): boolean {
  return (item.modelo ?? "").toLowerCase().includes(filtro);
}

function normalizarFiltro(filtro: string): string {
  return filtro.trim().toLowerCase();
}

// Padres que tienen algún hijo que coincide con el filtro: se abren solos
// al buscar, para que el componente encontrado quede a la vista.
function padresConHijosCoincidentes(muebles: MuebleTabla[], filtro: string): Set<string> {
  const f = normalizarFiltro(filtro);
  if (!f) return new Set();
  return new Set(muebles.filter((m) => m.hijos.some((h) => coincide(h, f))).map((m) => m.id));
}

// Solo se muestran los ítems padre (ITEM entero); al hacer click en uno se
// despliegan sus componentes hijo (ITEM decimal).
export default function ItemsTabla({
  muebles,
  imagenesPorItem,
  puedeEditar,
  filtroInicial,
}: {
  muebles: MuebleTabla[];
  imagenesPorItem: Record<string, string[]>;
  puedeEditar: boolean;
  filtroInicial: string;
}) {
  const [filtro, setFiltro] = useState(filtroInicial);
  const [expandidos, setExpandidos] = useState<Set<string>>(() =>
    padresConHijosCoincidentes(muebles, filtroInicial)
  );
  const [imagenAbierta, setImagenAbierta] = useState<{ urls: string[]; indice: number } | null>(
    null
  );

  const filtroNormalizado = normalizarFiltro(filtro);

  // Con filtro: se muestran los padres cuyo modelo coincide o que tienen
  // algún hijo que coincide (de esos, solo los hijos que coinciden).
  const visibles = useMemo(() => {
    if (!filtroNormalizado) {
      return muebles.map((m) => ({ mueble: m, hijos: m.hijos }));
    }
    return muebles.flatMap((m) => {
      const padreCoincide = coincide(m, filtroNormalizado);
      const hijosCoinciden = m.hijos.filter((h) => coincide(h, filtroNormalizado));
      if (!padreCoincide && hijosCoinciden.length === 0) return [];
      return [{ mueble: m, hijos: padreCoincide ? m.hijos : hijosCoinciden }];
    });
  }, [muebles, filtroNormalizado]);

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
          onChange={(e) => {
            setFiltro(e.target.value);
            setExpandidos(padresConHijosCoincidentes(muebles, e.target.value));
          }}
          placeholder="Buscar modelo en este pedido..."
          className="min-w-48 flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => setExpandidos(new Set(muebles.map((m) => m.id)))}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700"
        >
          Expandir todo
        </button>
        <button
          type="button"
          onClick={() => setExpandidos(new Set())}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700"
        >
          Contraer todo
        </button>
      </div>

      {visibles.length === 0 && (
        <p className="text-sm text-gray-600">Ningún modelo coincide con la búsqueda.</p>
      )}

      {visibles.length > 0 && (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-400">
              <th className="w-6 py-1"></th>
              <th className="py-1 pr-2">Imagen</th>
              <th className="py-1 pr-2">Item</th>
              <th className="py-1 pr-2">Modelo</th>
              <th className="py-1 pr-2">Material</th>
              <th className="py-1 pr-2">Descripción</th>
              <th className="py-1 pr-2">Cant.</th>
              <th className="py-1 pr-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(({ mueble: m, hijos }) => {
              const abierto = expandidos.has(m.id);
              return (
                <Fragment key={m.id}>
                  <tr
                    onClick={() => alternar(m.id)}
                    aria-expanded={abierto}
                    className={`cursor-pointer border-t border-gray-200 text-sm font-medium hover:bg-gray-50 ${colorFilaEstadoRevision(m.estado_revision)}`}
                  >
                    <td className="py-1 text-gray-400">
                      {hijos.length > 0 ? (abierto ? "▾" : "▸") : ""}
                    </td>
                    <td className="py-1 pr-2">
                      <ImagenesItem urls={imagenesPorItem[m.id] ?? []} onAbrir={abrirImagen} />
                    </td>
                    <td className="py-1 pr-2">{m.item_code}</td>
                    <td className="py-1 pr-2">{m.modelo}</td>
                    <td className="py-1 pr-2">{m.tipo_material}</td>
                    <td className="py-1 pr-2">
                      {m.descripcion}
                      {hijos.length > 0 && (
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          ({hijos.length} componentes)
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      {m.cantidad_total} {m.unidad}
                    </td>
                    <td className="py-1 pr-2" onClick={(e) => e.stopPropagation()}>
                      <EstadoCelda itemId={m.id} estado={m.estado_revision} puedeEditar={puedeEditar} />
                    </td>
                  </tr>
                  {abierto &&
                    hijos.map((f) => (
                      <tr
                        key={f.id}
                        className={`border-t border-gray-100 ${colorFilaEstadoRevision(f.estado_revision)}`}
                      >
                        <td></td>
                        <td className="py-1 pr-2 pl-3">
                          <ImagenesItem urls={imagenesPorItem[f.id] ?? []} onAbrir={abrirImagen} />
                        </td>
                        <td className="py-1 pr-2 pl-3">{f.item_code}</td>
                        <td className="py-1 pr-2">{f.modelo}</td>
                        <td className="py-1 pr-2">{f.tipo_material}</td>
                        <td className="py-1 pr-2">{f.descripcion?.split("\n")[0]}</td>
                        <td className="py-1 pr-2">
                          {f.cantidad_total} {f.unidad}
                        </td>
                        <td className="py-1 pr-2">
                          <EstadoCelda itemId={f.id} estado={f.estado_revision} puedeEditar={puedeEditar} />
                        </td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
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

function EstadoCelda({
  itemId,
  estado,
  puedeEditar,
}: {
  itemId: string;
  estado: EstadoRevision;
  puedeEditar: boolean;
}) {
  if (puedeEditar) {
    return <EstadoRevisionSelect itemId={itemId} estadoActual={estado} />;
  }
  if (!estado) return <span className="text-gray-400">—</span>;
  return <span>{ESTADO_REVISION_LABELS[estado]}</span>;
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
          <img src={url} alt="" className="h-10 w-10 rounded object-cover" />
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- imágenes en bucket privado vía signed URL, no next/image */}
      <img
        src={urls[indice]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] min-w-64 max-w-[90vw] rounded bg-white object-contain shadow-lg"
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
