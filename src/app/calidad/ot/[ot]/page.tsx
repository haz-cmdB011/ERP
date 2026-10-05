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

interface ItemEnviado {
  id: string;
  pedido_version_id: string;
}

interface InformeResumen {
  planeacion_item_id: string;
  aprobado: boolean;
}

interface Avance {
  enviados: number;
  aprobados: number;
  rechazados: number;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ot: string }>;
}): Promise<Metadata> {
  const { ot } = await params;
  return { title: `O.T. ${ot}` };
}

// Página de una O.T. en Calidad: sus PM disponibles con el avance de
// evaluación de los ítems enviados a producción (según el informe más
// reciente de cada ítem: aprobado, rechazado o sin evaluar).
export default async function OrdenTrabajoCalidadPage({
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

  // Ítems vigentes (no cancelados) enviados a producción de la versión activa
  // y sus informes; se filtra por versión y no por id de ítem para no mandar
  // cientos de ids en la URL.
  const [{ data: items }, { data: informes }] = idsVersiones.length
    ? await Promise.all([
        traerTodo<ItemEnviado>((desde, hasta) =>
          supabase
            .from("planeacion_items")
            .select("id, pedido_version_id")
            .in("pedido_version_id", idsVersiones)
            .eq("estado_liberacion", "enviado_a_produccion")
            .or("estado_revision.is.null,estado_revision.neq.cancelado")
            .order("id")
            .range(desde, hasta)
            .returns<ItemEnviado[]>()
        ),
        traerTodo<InformeResumen>((desde, hasta) =>
          supabase
            .from("informes_calidad")
            .select("planeacion_item_id, aprobado, planeacion_items!inner ( pedido_version_id )")
            .in("planeacion_items.pedido_version_id", idsVersiones)
            .order("elaborado_en", { ascending: false })
            .order("id")
            .range(desde, hasta)
            .returns<InformeResumen[]>()
        ),
      ])
    : [{ data: [] as ItemEnviado[] }, { data: [] as InformeResumen[] }];

  // Vienen del más reciente al más antiguo: el primero de cada ítem manda.
  const ultimoInforme = new Map<string, boolean>();
  for (const inf of informes) {
    if (!ultimoInforme.has(inf.planeacion_item_id)) ultimoInforme.set(inf.planeacion_item_id, inf.aprobado);
  }

  const avancePorVersion = new Map<string, Avance>();
  for (const item of items) {
    const a = avancePorVersion.get(item.pedido_version_id) ?? { enviados: 0, aprobados: 0, rechazados: 0 };
    a.enviados += 1;
    const ultimo = ultimoInforme.get(item.id);
    if (ultimo === true) a.aprobados += 1;
    else if (ultimo === false) a.rechazados += 1;
    avancePorVersion.set(item.pedido_version_id, a);
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
                  <th className="px-4 py-3 text-right">En producción</th>
                  <th className="px-4 py-3 text-right">Aprobados</th>
                  <th className="px-4 py-3 text-right">Rechazados</th>
                  <th className="px-4 py-3 text-right">Sin evaluar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pms.map((p) => {
                  const activa = versionActiva.get(p.id);
                  const a = activa ? avancePorVersion.get(activa.id) : undefined;
                  const sinEvaluar = a ? a.enviados - a.aprobados - a.rechazados : 0;
                  return (
                    <tr key={p.id} className="align-top transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/calidad/pedidos/${p.id}`}
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
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{a?.enviados ?? 0}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">
                        {a?.aprobados || "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-rose-700">
                        {a?.rechazados || "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-amber-700">
                        {sinEvaluar || "—"}
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
