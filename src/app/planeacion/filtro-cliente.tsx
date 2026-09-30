"use client";

import { useRouter } from "next/navigation";

// Filtro por cliente de la lista de Pedidos: aplica en cuanto se elige,
// conservando la búsqueda y el año.
export default function FiltroCliente({
  clientes,
  valor,
  q,
  anio,
}: {
  clientes: string[];
  valor: string;
  q?: string;
  anio?: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cliente</span>
      <select
        value={valor}
        onChange={(e) => {
          const qs = new URLSearchParams();
          if (q) qs.set("q", q);
          if (anio) qs.set("anio", anio);
          if (e.target.value) qs.set("cliente", e.target.value);
          const texto = qs.toString();
          router.push(texto ? `/planeacion?${texto}` : "/planeacion");
        }}
        className="max-w-xs rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none"
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
