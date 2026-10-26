import EnlaceFila from "@/components/enlace-fila";
import { formatoFechaDMA } from "@/lib/resumen/entrega";
import AccionesPedido from "./acciones-pedido";

export interface PedidoLista {
  id: string;
  numero_pedido: string;
  fecha_entrega: string | null;
  proyectos: { nombre: string; cliente: string } | null;
  pedido_versiones: { id: string; numero_version: number; es_version_activa: boolean }[];
}

// Los PM de una O.T. (en su página), uno por tarjeta, igual que en Producción. Toda la tarjeta es el
// enlace al pedido (el del número, extendido con after:inset-0); "Ver qué cambió" y las acciones van
// por encima (z-10) para seguir funcionando solas. Misma medida y mismas tres líneas (número,
// proyecto, entrega) que las tarjetas de PM de Producción y de Calidad.
export default function TablaPedidos({
  pedidos,
  esAdmin,
}: {
  pedidos: PedidoLista[];
  esAdmin: boolean;
}) {
  return (
    <ul className="lista-animada flex flex-col gap-3">
      {pedidos.map((p) => {
        const activa = p.pedido_versiones.find((v) => v.es_version_activa);
        return (
          <li
            key={p.id}
            className="relative flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 focus-within:bg-slate-50 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md sm:min-h-[6.5rem] sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <EnlaceFila
                href={`/planeacion/pedidos/${p.id}`}
                className="text-base font-semibold text-slate-900 outline-none after:absolute after:inset-0 after:rounded-xl hover:text-brand-700 focus-visible:after:ring-2 focus-visible:after:ring-brand-600 focus-visible:after:ring-inset"
              >
                {p.numero_pedido}
              </EnlaceFila>
              <p className="truncate text-sm text-slate-700">{p.proyectos?.nombre ?? "—"}</p>
              <p className="text-xs text-slate-500">Entrega: {formatoFechaDMA(p.fecha_entrega)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:justify-end">
              {activa ? (
                <>
                  <span
                    title="La versión activa es la que usa Producción"
                    className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                  >
                    Versión {activa.numero_version}
                  </span>
                  {activa.numero_version > 1 && (
                    <EnlaceFila
                      href={`/planeacion/pedidos/${p.id}/cambios?a=${activa.numero_version}`}
                      className="relative z-10 text-sm font-medium text-brand-700 hover:underline"
                    >
                      Ver qué cambió
                    </EnlaceFila>
                  )}
                </>
              ) : (
                <span className="text-sm text-slate-500">Sin versión</span>
              )}
              {esAdmin && (
                <div className="relative z-10">
                  <AccionesPedido pedidoId={p.id} numeroPedido={p.numero_pedido} eliminado={false} conEtiqueta />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
