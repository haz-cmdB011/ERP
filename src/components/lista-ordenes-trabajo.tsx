import Link from "next/link";
import FiltroCliente from "@/components/filtro-cliente";
import {
  hrefListaPedidos,
  ultimaEntrega,
  type FilaOrdenTrabajo,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import ChipEntrega from "@/components/chip-entrega";
import { estadoEntrega } from "@/lib/resumen/entrega";

// Chips de año + filtro de cliente de la lista de Pedidos por O.T.
export function FiltrosOrdenesTrabajo({
  base,
  anios,
  anio,
  clientes,
  cliente,
  q,
}: {
  base: string;
  anios: number[];
  anio: number | null;
  clientes: string[];
  cliente: string;
  q?: string;
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
              href={hrefListaPedidos(base, { q, anio: a ? String(a) : undefined, cliente: clienteParam })}
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
      <FiltroCliente base={base} clientes={clientes} valor={cliente} q={q} anio={anioParam} />
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
  hoy,
  chipEntrega,
}: {
  filas: FilaOrdenTrabajo<P>[];
  hrefOt: (ot: string) => string;
  hrefPedido: (pedidoId: string) => string;
  accion?: (fila: FilaOrdenTrabajo<P>) => React.ReactNode;
  // Columna extra con el estado de cada O.T. (liberación en Producción,
  // evaluación en Calidad).
  columnaEstado?: { titulo: string; celda: (fila: FilaOrdenTrabajo<P>) => React.ReactNode };
  // Fecha de hoy (YYYY-MM-DD): si se da, la entrega lleva una etiqueta de estado.
  hoy?: string;
  // Etiqueta propia junto a la fecha de entrega (en vez de la de `hoy`): para
  // áreas que saben si todavía queda trabajo pendiente, como Producción.
  chipEntrega?: (fila: FilaOrdenTrabajo<P>) => React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">O.T.</th>
            <th className="px-4 py-3">Proyecto</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">PM</th>
            <th className="px-4 py-3">Entrega</th>
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
              <tr key={fila.ot ?? primero.id} className="align-top transition-colors hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={href} className="group inline-flex items-center gap-2 whitespace-nowrap">
                    {fila.ot ? (
                      <span className="font-mono font-semibold text-slate-900 group-hover:text-brand-700 group-hover:underline">
                        {fila.ot}
                      </span>
                    ) : (
                      <span className="font-medium text-slate-900 group-hover:text-brand-700 group-hover:underline">
                        {primero.numero_pedido}
                      </span>
                    )}
                    <span className="text-slate-400 group-hover:text-brand-700" aria-hidden>
                      →
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{primero.proyectos?.nombre ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{primero.proyectos?.cliente ?? "—"}</td>
                <td className="px-4 py-3">
                  {fila.ot ? (
                    <span className="whitespace-nowrap rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {fila.pedidos.length} PM
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Sin O.T.</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                  <span className="mr-2">{ultimaEntrega(fila.pedidos) ?? "—"}</span>
                  {chipEntrega
                    ? chipEntrega(fila)
                    : hoy && <ChipEntrega estado={estadoEntrega(ultimaEntrega(fila.pedidos), hoy)} />}
                </td>
                {columnaEstado && <td className="px-4 py-3">{columnaEstado.celda(fila)}</td>}
                {accion && <td className="px-4 py-3">{accion(fila)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
