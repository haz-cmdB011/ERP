import Link from "next/link";
import AccionesPedido from "./acciones-pedido";

export interface PedidoLista {
  id: string;
  numero_pedido: string;
  fecha_entrega: string | null;
  proyectos: { nombre: string; cliente: string } | null;
  pedido_versiones: { id: string; numero_version: number; es_version_activa: boolean }[];
}

// Tabla de PM (los de una O.T., en su página).
export default function TablaPedidos({
  pedidos,
  esAdmin,
}: {
  pedidos: PedidoLista[];
  esAdmin: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Pedido</th>
            <th className="px-4 py-3">Proyecto</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Entrega</th>
            <th className="px-4 py-3">Versión activa</th>
            {esAdmin && <th className="px-4 py-3"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pedidos.map((p) => {
            const activa = p.pedido_versiones.find((v) => v.es_version_activa);
            return (
              <tr key={p.id} className="align-top transition-colors hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/planeacion/pedidos/${p.id}`}
                    className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                  >
                    {p.numero_pedido}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{p.proyectos?.nombre ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{p.proyectos?.cliente ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{p.fecha_entrega ?? "—"}</td>
                <td className="px-4 py-3">
                  {activa ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        #{activa.numero_version}
                      </span>
                      {activa.numero_version > 1 && (
                        <Link
                          href={`/planeacion/pedidos/${p.id}/cambios?a=${activa.numero_version}`}
                          className="text-xs text-brand-700 hover:underline"
                        >
                          qué cambió
                        </Link>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                {esAdmin && (
                  <td className="px-4 py-3">
                    <AccionesPedido pedidoId={p.id} eliminado={false} />
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
