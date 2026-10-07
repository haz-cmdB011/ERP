import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { traerTodo } from "@/lib/supabase/traer-todo";

interface PedidoOt {
  id: string;
  numero_pedido: string;
  fecha_entrega: string | null;
  cancelado_en: string | null;
  proyectos: { nombre: string; cliente: string } | null;
  pedido_versiones: { id: string; numero_version: number; es_version_activa: boolean }[];
}

interface MuebleConteo {
  pedido_version_id: string;
  estado_liberacion: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ot: string }>;
}): Promise<Metadata> {
  const { ot } = await params;
  return { title: `O.T. ${ot}` };
}

// Página de una O.T. en Producción: sus PM disponibles, cuántos muebles de
// cada uno ya se liberaron y cuántas asignaciones siguen en el taller.
export default async function OrdenTrabajoProduccionPage({
  params,
}: {
  params: Promise<{ ot: string }>;
}) {
  const { ot } = await params;
  // Formato de O.T. de la columna generada pedidos.orden_trabajo: "134-26".
  if (!/^\d+-\d{2}$/.test(ot)) notFound();
  const supabase = await createClient();

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select(
      "id, numero_pedido, fecha_entrega, cancelado_en, proyectos ( nombre, cliente ), pedido_versiones ( id, numero_version, es_version_activa )"
    )
    .eq("orden_trabajo", ot)
    .is("eliminado_en", null)
    .is("eliminado_definitivo_en", null)
    .returns<PedidoOt[]>();

  if (!error && (!pedidos || pedidos.length === 0)) notFound();

  const pms = (pedidos ?? []).sort((a, b) =>
    a.numero_pedido.localeCompare(b.numero_pedido, "es", { numeric: true })
  );
  const primero = pms[0];
  const versionActiva = new Map(
    pms.map((p) => [p.id, p.pedido_versiones.find((v) => v.es_version_activa) ?? null])
  );
  const idsVersiones = [...versionActiva.values()].filter((v) => v !== null).map((v) => v.id);

  const [{ data: muebles }, { data: enTaller }] = await Promise.all([
    // Muebles (ítems padre) vigentes de la versión activa de cada PM.
    idsVersiones.length
      ? traerTodo<MuebleConteo>((desde, hasta) =>
          supabase
            .from("planeacion_items")
            .select("pedido_version_id, estado_liberacion")
            .in("pedido_version_id", idsVersiones)
            .eq("tipo_registro", "MO")
            .is("eliminacion_solicitada_en", null)
            .or("estado_revision.is.null,estado_revision.neq.cancelado")
            .order("id")
            .range(desde, hasta)
            .returns<MuebleConteo[]>()
        )
      : Promise.resolve({ data: [] as MuebleConteo[] }),
    supabase
      .from("asignaciones_produccion_resumen")
      .select("pedido_id")
      .in(
        "pedido_id",
        pms.map((p) => p.id)
      )
      .in("estado", ["en_proceso", "parcial"])
      .returns<{ pedido_id: string }[]>(),
  ]);

  const conteoMuebles = new Map<string, { total: number; liberados: number }>();
  for (const m of muebles ?? []) {
    const c = conteoMuebles.get(m.pedido_version_id) ?? { total: 0, liberados: 0 };
    c.total += 1;
    if (m.estado_liberacion === "enviado_a_produccion") c.liberados += 1;
    conteoMuebles.set(m.pedido_version_id, c);
  }
  const enTallerPorPedido = new Map<string, number>();
  for (const a of enTaller ?? []) {
    enTallerPorPedido.set(a.pedido_id, (enTallerPorPedido.get(a.pedido_id) ?? 0) + 1);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          O.T. <span className="font-mono">{ot}</span>
        </h1>
        {primero && (
          <p className="text-sm text-slate-600">
            {primero.proyectos?.nombre} — {primero.proyectos?.cliente}
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar los PM: {error.message}
        </p>
      )}

      {pms.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-600">
            {pms.length} PM en esta O.T.
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Proyecto</th>
                  <th className="px-4 py-3">Entrega</th>
                  <th className="px-4 py-3">Versión activa</th>
                  <th className="px-4 py-3">Muebles liberados</th>
                  <th className="px-4 py-3">En taller</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pms.map((p) => {
                  const activa = versionActiva.get(p.id);
                  const conteo = activa ? conteoMuebles.get(activa.id) : undefined;
                  const taller = enTallerPorPedido.get(p.id) ?? 0;
                  return (
                    <tr key={p.id} className="align-top transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/produccion/pedidos/${p.id}`}
                          className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {p.numero_pedido}
                        </Link>
                        {p.cancelado_en && (
                          <span className="ml-2 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                            Cancelado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{p.proyectos?.nombre ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{p.fecha_entrega ?? "—"}</td>
                      <td className="px-4 py-3">
                        {activa ? (
                          <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                            #{activa.numero_version}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {conteo ? `${conteo.liberados} / ${conteo.total}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {taller > 0 ? `${taller} asignaci${taller === 1 ? "ón" : "ones"}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/produccion/pedidos/${p.id}/asignaciones`}
                          className="whitespace-nowrap text-sm font-medium text-brand-700 hover:underline"
                        >
                          Asignar a equipos
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
