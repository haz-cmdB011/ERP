import Link from "next/link";
import ChipEstado from "@/components/chip-estado";
import { estadoLiberacion, type AvancePedido } from "@/lib/resumen/avance-items";
import type { FilaOrdenTrabajo, PedidoConOt } from "@/lib/planeacion/lista-ordenes-trabajo";

// Lista de pedidos de Producción: una tarjeta por O.T. (o por pedido suelto sin O.T.). Toda la
// tarjeta abre la O.T.; el avance se lee con palabras ("3 de 8 liberados"), no solo con una barra.
export default function ListaOrdenes({
  filas,
  avanceDe,
}: {
  filas: FilaOrdenTrabajo<PedidoConOt>[];
  avanceDe: (fila: FilaOrdenTrabajo<PedidoConOt>) => AvancePedido;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {filas.map((fila) => {
        const primero = fila.pedidos[0];
        const href = fila.ot
          ? `/produccion/ot/${encodeURIComponent(fila.ot)}`
          : `/produccion/pedidos/${primero.id}`;
        const titulo = fila.ot ? `O.T. ${fila.ot}` : primero.numero_pedido;
        const avance = avanceDe(fila);
        const estado = estadoLiberacion(avance);
        const porcentaje = avance.total > 0 ? Math.round((avance.liberados / avance.total) * 100) : 0;
        return (
          <li
            key={fila.ot ?? primero.id}
            className="relative flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <Link
              href={href}
              aria-label={`Abrir ${titulo}`}
              className="absolute inset-0 rounded-xl focus-visible:outline-brand-500"
            />
            <div className="min-w-0">
              <p className="font-mono text-base font-semibold text-slate-900">{titulo}</p>
              <p className="truncate text-sm text-slate-700">{primero.proyectos?.nombre ?? "—"}</p>
              {primero.proyectos?.cliente && (
                <p className="text-xs text-slate-500">{primero.proyectos.cliente}</p>
              )}
            </div>
            <div className="flex flex-col gap-1 sm:w-52 sm:shrink-0">
              {estado === "sin-items" ? (
                <ChipEstado tono="neutro">Sin muebles todavía</ChipEstado>
              ) : (
                <>
                  <p className="text-sm text-slate-700">
                    {estado === "liberado" ? (
                      <span className="font-medium text-emerald-700">Todo liberado</span>
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
          </li>
        );
      })}
    </ul>
  );
}
