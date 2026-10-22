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

// Tabla de PM (los de una O.T., en su página). Proyecto y cliente solo salen cuando los PM de
// la O.T. no comparten los mismos: si no, ya están en el encabezado de la página.
export default function TablaPedidos({
  pedidos,
  esAdmin,
  mostrarProyecto = true,
}: {
  pedidos: PedidoLista[];
  esAdmin: boolean;
  mostrarProyecto?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Pedido (PM)</th>
            {mostrarProyecto && <th className="px-4 py-3">Proyecto</th>}
            {mostrarProyecto && <th className="px-4 py-3">Cliente</th>}
            <th className="px-4 py-3">Entrega</th>
            <th className="px-4 py-3">Versión</th>
            {esAdmin && <th className="px-4 py-3"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pedidos.map((p) => {
            const activa = p.pedido_versiones.find((v) => v.es_version_activa);
            return (
              <tr key={p.id} className="relative align-top transition-colors focus-within:bg-slate-50 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <EnlaceFila
                    href={`/planeacion/pedidos/${p.id}`}
                    className="group inline-flex items-center gap-2 whitespace-nowrap font-medium text-slate-900 outline-none after:absolute after:inset-0 hover:text-brand-700 hover:underline focus-visible:after:ring-2 focus-visible:after:ring-brand-600 focus-visible:after:ring-inset"
                  >
                    {p.numero_pedido}
                    <span className="text-slate-500 group-hover:text-brand-700" aria-hidden>
                      →
                    </span>
                  </EnlaceFila>
                </td>
                {mostrarProyecto && <td className="px-4 py-3 text-slate-700">{p.proyectos?.nombre ?? "—"}</td>}
                {mostrarProyecto && <td className="px-4 py-3 text-slate-700">{p.proyectos?.cliente ?? "—"}</td>}
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                  {formatoFechaDMA(p.fecha_entrega)}
                </td>
                <td className="px-4 py-3">
                  {activa ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        title="La versión activa es la que usa Producción"
                        className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                      >
                        Versión {activa.numero_version}
                      </span>
                      {activa.numero_version > 1 && (
                        <EnlaceFila
                          href={`/planeacion/pedidos/${p.id}/cambios?a=${activa.numero_version}`}
                          className="relative z-10 text-xs text-brand-700 hover:underline"
                        >
                          Ver qué cambió
                        </EnlaceFila>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                {esAdmin && (
                  // La celda no captura clics (pointer-events-none): solo el botón, para que el resto de la
                  // fila siga abriendo el pedido.
                  <td className="pointer-events-none px-4 py-3">
                    <div className="pointer-events-auto relative z-10 inline-block">
                      <AccionesPedido pedidoId={p.id} numeroPedido={p.numero_pedido} eliminado={false} conEtiqueta />
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
