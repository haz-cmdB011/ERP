"use client";

import Link from "next/link";
import { useState } from "react";
import ImagenAmpliable from "@/components/imagen-ampliable";
import { IconoCheck, IconoReloj } from "@/components/iconos-estado";
import type { GrupoBusqueda, ItemBusqueda } from "@/lib/produccion/buscar-muebles";

function EstadoBadge({ item }: { item: ItemBusqueda }) {
  if (item.estadoLiberacion === "enviado_a_produccion") {
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

function Miniatura({ item, grande }: { item: ItemBusqueda; grande: boolean }) {
  const tamano = grande ? "h-12 w-12" : "h-9 w-9";
  return item.imagenUrl ? (
    <ImagenAmpliable
      url={item.imagenUrl}
      urlGrande={item.imagenGrandeUrl}
      alt={`Ítem ${item.item_code}${item.modelo ? ` — ${item.modelo}` : ""}`}
      className={tamano}
    />
  ) : (
    <span
      className={`block shrink-0 rounded border border-dashed border-slate-200 ${tamano}`}
      title="Sin imagen"
    />
  );
}

// Resultados de la búsqueda de muebles/modelos: cada tarjeta es un mueble (ítem
// padre) con su pedido; al hacer clic se despliegan sus componentes (hijos). Si
// el mueble apareció porque coincidió un componente, ya sale desplegado.
export default function ResultadosMuebles({ grupos }: { grupos: GrupoBusqueda[] }) {
  // Sin entrada, cada tarjeta decide sola (cerrada, salvo que coincidió un hijo).
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const estaAbierto = (g: GrupoBusqueda) => abiertos[g.padre.id] ?? g.abrirPorBusqueda;
  const conHijos = grupos.filter((g) => g.hijos.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {conHijos.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAbiertos(Object.fromEntries(conHijos.map((g) => [g.padre.id, true])))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Desplegar todos
          </button>
          <button
            type="button"
            onClick={() => setAbiertos(Object.fromEntries(conHijos.map((g) => [g.padre.id, false])))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Contraer todos
          </button>
        </div>
      )}

      {grupos.map((g) => {
        const abierto = estaAbierto(g);
        const desplegable = g.hijos.length > 0;
        const coincidentes = g.hijos.filter((h) => h.coincide).length;
        const alternar = () =>
          desplegable && setAbiertos((prev) => ({ ...prev, [g.padre.id]: !abierto }));

        return (
          <div
            key={g.padre.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            {/* Fila del mueble (ítem padre): clicable para desplegar sus hijos. */}
            <div
              onClick={alternar}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 ${
                desplegable ? "cursor-pointer hover:bg-slate-50" : ""
              }`}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <Miniatura item={g.padre} grande />
              </div>

              <div className="flex min-w-0 flex-1 basis-64 flex-col">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
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
                  {g.padre.item_code}
                  {g.padre.modelo ? ` — ${g.padre.modelo}` : ""}
                </span>
                <span className="text-xs text-slate-600">{g.padre.descripcion ?? "—"}</span>
                {desplegable && (
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    {g.hijos.length} componente{g.hijos.length === 1 ? "" : "s"}
                    {coincidentes > 0 ? ` (${coincidentes} coinciden)` : ""}
                  </span>
                )}
              </div>

              <div className="flex min-w-40 flex-col text-xs" onClick={(e) => e.stopPropagation()}>
                <Link
                  href={`/produccion/pedidos/${g.pedidoId}`}
                  className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                >
                  {g.numeroPedido}
                </Link>
                <span className="text-slate-500">
                  {g.proyecto ?? "—"} — {g.cliente ?? "—"}
                </span>
              </div>

              <div className="text-xs text-slate-700">
                {g.padre.cantidad_total} {g.padre.unidad}
              </div>
              <div>
                <EstadoBadge item={g.padre} />
              </div>
              <div className="min-w-24 whitespace-nowrap font-mono text-xs text-slate-800">
                {g.padre.folio ?? <span className="font-sans text-slate-400">—</span>}
              </div>
            </div>

            {/* Componentes (hijos): solo al desplegar. */}
            {abierto && desplegable && (
              <div className="overflow-x-auto border-t border-slate-200 bg-slate-50/50">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Imagen</th>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Material</th>
                      <th className="px-3 py-2">Descripción</th>
                      <th className="px-3 py-2">Cant.</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Folio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {g.hijos.map((h) => (
                      <tr
                        key={h.id}
                        className={`align-top text-slate-700 ${h.coincide ? "bg-amber-50/70" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <Miniatura item={h} grande={false} />
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900">{h.item_code}</td>
                        <td className="px-3 py-2">{h.tipo_material ?? "—"}</td>
                        <td className="px-3 py-2">{h.descripcion?.split("\n")[0] ?? "—"}</td>
                        <td className="px-3 py-2">
                          {h.cantidad_total} {h.unidad}
                        </td>
                        <td className="px-3 py-2">
                          <EstadoBadge item={h} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-800">
                          {h.folio ?? <span className="font-sans font-normal text-slate-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
