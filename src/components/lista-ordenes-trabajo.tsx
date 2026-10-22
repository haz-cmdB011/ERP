import Link from "next/link";
import EnlaceFila from "@/components/enlace-fila";
import FiltroCliente from "@/components/filtro-cliente";
import {
  hrefListaPedidos,
  type FilaOrdenTrabajo,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";

// Chips de año + filtro de cliente de la lista de Pedidos por O.T. Conservan la
// búsqueda y, si la lista la tiene, la entrega elegida.
export function FiltrosOrdenesTrabajo({
  base,
  anios,
  anio,
  clientes,
  cliente,
  q,
  entrega,
}: {
  base: string;
  anios: number[];
  anio: number | null;
  clientes: string[];
  cliente: string;
  q?: string;
  entrega?: string;
}) {
  if (anios.length === 0) return null;
  const anioParam = anio ? String(anio) : undefined;
  const clienteParam = cliente || undefined;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Año</span>
        {[null, ...anios].map((a) => {
          const activo = a === anio;
          return (
            <Link
              key={a ?? "todos"}
              href={hrefListaPedidos(base, { q, anio: a ? String(a) : undefined, cliente: clienteParam, entrega })}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activo
                  ? "border-brand-600 bg-brand-500 text-on-brand"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {a ?? "Todos"}
            </Link>
          );
        })}
      </div>
      <FiltroCliente base={base} clientes={clientes} valor={cliente} q={q} anio={anioParam} entrega={entrega} />
    </div>
  );
}

// Tabla de O.T. (una fila por O.T., o por PM suelto sin O.T.). `hrefOt` y
// `hrefPedido` dicen a qué pantalla del área lleva cada fila; `accion` agrega
// una columna opcional (p. ej. eliminar un PM suelto en Planeación).
export function TablaOrdenesTrabajo<P extends PedidoConOt>({
  filas,
  hrefOt,
  hrefPedido,
  accion,
  columnaEstado,
  filaClicable = false,
}: {
  filas: FilaOrdenTrabajo<P>[];
  hrefOt: (ot: string) => string;
  hrefPedido: (pedidoId: string) => string;
  accion?: (fila: FilaOrdenTrabajo<P>) => React.ReactNode;
  // Columna extra con el estado de cada O.T. (liberación en Producción,
  // evaluación en Calidad).
  columnaEstado?: { titulo: string; celda: (fila: FilaOrdenTrabajo<P>) => React.ReactNode };
  // El enlace de la O.T. se extiende sobre toda la fila: tocar cualquier parte la abre. Los botones
  // de `accion` quedan por encima para seguir funcionando solos.
  filaClicable?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">O.T.</th>
            <th className="px-4 py-3">Proyecto</th>
            {columnaEstado && <th className="px-4 py-3">{columnaEstado.titulo}</th>}
            {accion && <th className="px-4 py-3"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((fila) => {
            const primero = fila.pedidos[0];
            // Un PM suelto (sin O.T.) lleva directo a su detalle.
            const href = fila.ot ? hrefOt(fila.ot) : hrefPedido(primero.id);
            return (
              <tr
                key={fila.ot ?? primero.id}
                className={`align-top transition-colors hover:bg-slate-50 ${
                  filaClicable ? "relative focus-within:bg-slate-50" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <EnlaceFila
                    href={href}
                    className={`group inline-flex items-center gap-2 whitespace-nowrap ${
                      filaClicable
                        ? "outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-brand-600 focus-visible:after:ring-inset"
                        : ""
                    }`}
                  >
                    {fila.ot ? (
                      <span className="font-mono font-semibold text-slate-900 group-hover:text-brand-700 group-hover:underline">
                        {fila.ot}
                      </span>
                    ) : (
                      <span className="font-medium text-slate-900 group-hover:text-brand-700 group-hover:underline">
                        {primero.numero_pedido}
                      </span>
                    )}
                    <span className="text-slate-500 group-hover:text-brand-700" aria-hidden>
                      →
                    </span>
                  </EnlaceFila>
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-900">{primero.proyectos?.nombre ?? "—"}</p>
                  {primero.proyectos?.cliente && (
                    <p className="text-xs text-slate-500">{primero.proyectos.cliente}</p>
                  )}
                </td>
                {columnaEstado && <td className="px-4 py-3">{columnaEstado.celda(fila)}</td>}
                {accion && <td className={`px-4 py-3 ${filaClicable ? "relative z-10" : ""}`}>{accion(fila)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
