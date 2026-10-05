import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Bienvenida from "@/components/bienvenida";
import ResumenInicio from "@/components/resumen-inicio";
import { avancePorPedido, sumarAvance } from "@/lib/resumen/avance-items";
import EstadoCalidad from "./estado-calidad";

interface PedidoRow {
  id: string;
  numero_pedido: string;
  fecha_pedido: string | null;
  fecha_entrega: string | null;
  estado: string;
  cancelado_en: string | null;
  proyectos: { nombre: string; cliente: string } | null;
  pedido_versiones: { id: string; numero_version: number; es_version_activa: boolean }[];
}

export default async function CalidadListPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f } = await searchParams;
  const soloPorEvaluar = f === "por-evaluar";
  const supabase = await createClient();

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select(
      "id, numero_pedido, fecha_pedido, fecha_entrega, estado, cancelado_en, proyectos ( nombre, cliente ), pedido_versiones ( id, numero_version, es_version_activa )"
    )
    .is("eliminado_en", null)
    // Eliminado definitivo con folios de Calidad: solo vive en Cancelados.
    .is("eliminado_definitivo_en", null)
    .order("created_at", { ascending: false })
    .returns<PedidoRow[]>();

  // Avance de evaluación por pedido y totales para las tarjetas.
  const avance = await avancePorPedido(supabase, { conCalidad: true });
  const total = sumarAvance(avance);
  const conPendientes = [...avance.values()].filter((a) => a.porEvaluar > 0).length;
  const visibles = (pedidos ?? []).filter(
    (p) => !soloPorEvaluar || (avance.get(p.id)?.porEvaluar ?? 0) > 0
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida acciones={[{ href: "/calidad/folios", etiqueta: "Folios de calidad" }]} />
      <ResumenInicio
        tarjetas={[
          {
            valor: total.porEvaluar,
            etiqueta: "Ítems por evaluar",
            detalle: `en ${conPendientes} pedido${conPendientes === 1 ? "" : "s"}`,
            href: "/calidad?f=por-evaluar",
            tono: "atencion",
          },
          { valor: total.evaluados, etiqueta: "Ítems evaluados", detalle: "con al menos un informe" },
          { valor: total.liberados, etiqueta: "Ítems en producción", detalle: "liberados por Producción", href: "/calidad" },
        ]}
      />
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Pedidos — Calidad
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Selecciona un pedido para revisar y evaluar sus ítems enviados a producción.
          </p>
        </div>
        {pedidos && pedidos.length > 0 && (
          <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar los pedidos: {error.message}
        </p>
      )}

      {!error && (!pedidos || pedidos.length === 0) && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no hay pedidos cargados.
        </p>
      )}

      {soloPorEvaluar && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          Mostrando solo los pedidos con ítems por evaluar ({visibles.length}).
          <Link href="/calidad" className="font-medium underline-offset-2 hover:underline">
            Ver todos
          </Link>
        </p>
      )}

      {pedidos && pedidos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Proyecto</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Entrega</th>
                <th className="px-4 py-3">Evaluación</th>
                <th className="px-4 py-3">Versión activa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((p) => {
                const activa = p.pedido_versiones.find((v) => v.es_version_activa);
                return (
                  <tr key={p.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/calidad/pedidos/${p.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {p.numero_pedido}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{p.proyectos?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{p.proyectos?.cliente ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{p.fecha_entrega ?? "—"}</td>
                    <td className="px-4 py-3">
                      <EstadoCalidad cancelado={!!p.cancelado_en} avance={avance.get(p.id)} />
                    </td>
                    <td className="px-4 py-3">
                      {activa ? (
                        <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          #{activa.numero_version}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
