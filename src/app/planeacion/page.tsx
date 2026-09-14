import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

interface PedidoRow {
  id: string;
  numero_pedido: string;
  fecha_pedido: string | null;
  fecha_entrega: string | null;
  estado: string;
  proyectos: { nombre: string; cliente: string } | null;
  pedido_versiones: { id: string; numero_version: number; es_version_activa: boolean }[];
}

export default async function PlaneacionListPage() {
  const supabase = await createClient();

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select(
      "id, numero_pedido, fecha_pedido, fecha_entrega, estado, proyectos ( nombre, cliente ), pedido_versiones ( id, numero_version, es_version_activa )"
    )
    .order("created_at", { ascending: false })
    .returns<PedidoRow[]>();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pedidos de Planeación</h1>
        <Link
          href="/planeacion/upload"
          className="rounded bg-black px-3 py-2 text-sm font-medium text-white"
        >
          Cargar Excel
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          No se pudieron cargar los pedidos: {error.message}
        </p>
      )}

      {!error && (!pedidos || pedidos.length === 0) && (
        <p className="text-sm text-gray-600">
          Todavía no hay pedidos cargados. Sube el primer Excel de Planeación
          para empezar.
        </p>
      )}

      {pedidos && pedidos.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 pr-4">Pedido</th>
              <th className="py-2 pr-4">Proyecto</th>
              <th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Entrega</th>
              <th className="py-2 pr-4">Versión activa</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => {
              const activa = p.pedido_versiones.find((v) => v.es_version_activa);
              return (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/planeacion/pedidos/${p.id}`}
                      className="font-medium underline"
                    >
                      {p.numero_pedido}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{p.proyectos?.nombre ?? "—"}</td>
                  <td className="py-2 pr-4">{p.proyectos?.cliente ?? "—"}</td>
                  <td className="py-2 pr-4">{p.fecha_entrega ?? "—"}</td>
                  <td className="py-2 pr-4">
                    {activa ? `#${activa.numero_version}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
