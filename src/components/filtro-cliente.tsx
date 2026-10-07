"use client";

import { useRouter } from "next/navigation";
import { hrefListaPedidos } from "@/lib/planeacion/lista-ordenes-trabajo";

// Filtro por cliente de la lista de Pedidos (Planeación o Producción): aplica
// en cuanto se elige, conservando la búsqueda, el año y la entrega.
export default function FiltroCliente({
  base,
  clientes,
  valor,
  q,
  anio,
  entrega,
}: {
  base: string;
  clientes: string[];
  valor: string;
  q?: string;
  anio?: string;
  entrega?: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cliente</span>
      <select
        value={valor}
        onChange={(e) =>
          router.push(hrefListaPedidos(base, { q, anio, entrega, cliente: e.target.value || undefined }))
        }
        className="max-w-xs rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-brand-600 focus:outline-none"
      >
        <option value="">Todos</option>
        {clientes.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
