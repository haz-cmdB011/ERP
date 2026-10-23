import Link from "next/link";
import IconoMenu from "@/components/iconos-menu";
import ChipEstado from "@/components/chip-estado";
import Chevron from "@/components/chevron";
import { estadoLiberacion, type AvancePedido } from "@/lib/resumen/avance-items";
import type { FilaOrdenTrabajo, PedidoConOt } from "@/lib/planeacion/lista-ordenes-trabajo";

// Lista de pedidos de Producción: una tarjeta por O.T. (o por pedido suelto sin O.T.). Toda la
// tarjeta es un enlace, igual que en Planeación: una O.T. con un solo PM abre directo el pedido; con
// varios, abre la O.T. para elegir. El avance se lee con palabras ("3 de 8 liberados"), no solo con una barra.
export default function ListaOrdenes({
  filas,
  avanceDe,
}: {
  filas: FilaOrdenTrabajo<PedidoConOt>[];
  avanceDe: (fila: FilaOrdenTrabajo<PedidoConOt>) => AvancePedido;
}) {
  return (
    <ul className="lista-animada flex flex-col gap-3">
      {filas.map((fila) => {
        const primero = fila.pedidos[0];
        const href =
          fila.ot && fila.pedidos.length > 1
            ? `/produccion/ot/${encodeURIComponent(fila.ot)}`
            : `/produccion/pedidos/${primero.id}`;
        const titulo = fila.ot ? `O.T. ${fila.ot}` : primero.numero_pedido;
        const avance = avanceDe(fila);
        const estado = estadoLiberacion(avance);
        const porcentaje = avance.total > 0 ? Math.round((avance.liberados / avance.total) * 100) : 0;
        return (
          <li
            key={fila.ot ?? primero.id}
            className="relative flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <Link
              href={href}
              aria-label={`Abrir ${titulo}`}
              className="absolute inset-0 rounded-xl focus-visible:outline-brand-500"
            />
            <div className="min-w-0 sm:flex-1">
              <p className="font-mono text-base font-semibold text-slate-900">{titulo}</p>
              <p className="truncate text-sm text-slate-700">{primero.proyectos?.nombre ?? "—"}</p>
              {(primero.proyectos?.cliente || fila.pedidos.length > 1) && (
                <p className="text-xs text-slate-500">
                  {[primero.proyectos?.cliente, fila.pedidos.length > 1 ? `${fila.pedidos.length} pedidos` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1 sm:w-52 sm:shrink-0">
              {estado === "sin-items" ? (
                <ChipEstado tono="neutro">Sin muebles todavía</ChipEstado>
              ) : (
                <>
                  <p className="text-sm text-slate-700">
                    {estado === "liberado" ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                        <IconoMenu nombre="check" className="h-4 w-4" />
                        Todo liberado
                      </span>
                    ) : (
                      <>
                        <span className="font-semibold">{avance.liberados}</span> de {avance.total} liberados
                      </>
                    )}
                  </p>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={porcentaje}
                    aria-label={`${avance.liberados} de ${avance.total} ítems liberados`}
                    className={`h-1.5 overflow-hidden rounded-full ${
                      estado === "sin-liberar" ? "bg-amber-200" : "bg-slate-200"
                    }`}
                  >
                    <div
                      className={`h-full rounded-full ${estado === "liberado" ? "bg-emerald-500" : "bg-brand-500"}`}
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                </>
              )}
            </div>
            <Chevron
              abierto={false}
              className="pointer-events-none hidden h-4 w-4 shrink-0 text-slate-400 sm:block"
            />
          </li>
        );
      })}
    </ul>
  );
}
