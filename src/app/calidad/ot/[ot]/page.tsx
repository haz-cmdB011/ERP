import Migas from "@/components/migas";
import EnlaceFila from "@/components/enlace-fila";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { traerTodo } from "@/lib/supabase/traer-todo";
import { ErrorLectura } from "@/lib/supabase/paginar";
import { enTallerParaCalidad, listosParaCalidad } from "@/lib/calidad/estado-item";
import { verificacionProduccionActiva } from "@/lib/calidad/ajustes-flujo";
import { cargarMueblesPreaprobados } from "@/lib/calidad/preaprobados-db";

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
  tipo_registro: "MO" | "FU";
  parent_item_id: string | null;
}

interface InformeResumen {
  planeacion_item_id: string;
  aprobado: boolean;
}

interface Avance {
  // Listos para Calidad (preaprobados o con informes).
  enviados: number;
  aprobados: number;
  rechazados: number;
  // Siguen en taller: se ven, pero no cuentan como pendientes de Calidad.
  enTaller: number;
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

  if (error) throw new ErrorLectura(`No se pudo leer la O.T.: ${error.message}`);
  if (!pedidos || pedidos.length === 0) notFound();

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
  const [{ data: items, error: errorItems }, { data: informes, error: errorInformes }] = idsVersiones.length
    ? await Promise.all([
        traerTodo<ItemEnviado>((desde, hasta) =>
          supabase
            .from("planeacion_items")
            .select("id, pedido_version_id, tipo_registro, parent_item_id")
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
    : [
        { data: [] as ItemEnviado[], error: null },
        { data: [] as InformeResumen[], error: null },
      ];
  // Un avance con lecturas incompletas parecería real: mejor el aviso con "Reintentar".
  if (errorItems || errorInformes) {
    throw new ErrorLectura(`No se pudo leer el avance de la O.T.: ${errorItems ?? errorInformes}`);
  }

  // El avance cuenta lo listo para Calidad (lo que Producción ya preaprobó y el
  // historial con informes); lo que sigue en taller se cuenta aparte.
  const [preaprobados, verificacionActiva] = await Promise.all([
    cargarMueblesPreaprobados(supabase, pms.map((p) => p.id)),
    verificacionProduccionActiva(supabase),
  ]);
  const listos = listosParaCalidad(
    items,
    preaprobados,
    new Set(informes.map((i) => i.planeacion_item_id)),
    verificacionActiva
  );
  const enTaller = enTallerParaCalidad(items, listos);

  // Vienen del más reciente al más antiguo: el primero de cada ítem manda.
  const ultimoInforme = new Map<string, boolean>();
  for (const inf of informes) {
    if (!ultimoInforme.has(inf.planeacion_item_id)) ultimoInforme.set(inf.planeacion_item_id, inf.aprobado);
  }

  const avancePorVersion = new Map<string, Avance>();
  for (const item of items) {
    const a = avancePorVersion.get(item.pedido_version_id) ?? {
      enviados: 0,
      aprobados: 0,
      rechazados: 0,
      enTaller: 0,
    };
    avancePorVersion.set(item.pedido_version_id, a);
    if (enTaller.has(item.id)) {
      a.enTaller += 1;
      continue;
    }
    if (!listos.has(item.id)) continue;
    a.enviados += 1;
    const ultimo = ultimoInforme.get(item.id);
    if (ultimo === true) a.aprobados += 1;
    else if (ultimo === false) a.rechazados += 1;
  }

  // Aparecen los PM con algo enviado a producción, listo para Calidad o en taller.
  const pmsVisibles = pms.filter((p) => {
    const activa = versionActiva.get(p.id);
    const a = activa ? avancePorVersion.get(activa.id) : undefined;
    return (a?.enviados ?? 0) + (a?.enTaller ?? 0) > 0;
  });

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Migas items={[{ etiqueta: "Pedidos", href: "/calidad" }, { etiqueta: `O.T. ${ot}` }]} />
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          O.T. <span className="font-mono">{ot}</span>
        </h1>
        {primero && (
          <p className="text-sm text-slate-600">
            {primero.proyectos?.nombre} — {primero.proyectos?.cliente}
          </p>
        )}
      </div>

      {pmsVisibles.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Ningún mueble de esta O.T. se ha enviado a producción. Cuando se envíe, aparecerá aquí.
        </p>
      )}

      {pmsVisibles.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <span className="rounded-full bg-brand-100 px-3 py-0.5 text-xs font-bold text-brand-900">
              {pmsVisibles.length}
            </span>
            PM con muebles en producción
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 border-t-4 border-t-brand-500 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-2 py-3">Pedido</th>
                  <th className="px-2 py-3">Proyecto</th>
                  <th className="px-2 py-3">Entrega</th>
                  <th className="px-2 py-3">Versión activa</th>
                  <th className="px-2 py-3 text-right">En Calidad</th>
                  <th className="px-2 py-3 text-right">Aprobados</th>
                  <th className="px-2 py-3 text-right">Rechazados</th>
                  <th className="px-2 py-3 text-right">Sin evaluar</th>
                  <th className="px-2 py-3 text-right" title="Producción todavía no los preaprueba">
                    En taller
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pmsVisibles.map((p) => {
                  const activa = versionActiva.get(p.id);
                  const a = activa ? avancePorVersion.get(activa.id) : undefined;
                  const sinEvaluar = a ? a.enviados - a.aprobados - a.rechazados : 0;
                  // Avance de la revisión: lo aprobado sobre lo que ya está en Calidad.
                  const pctAprobado = a && a.enviados > 0 ? Math.round((a.aprobados / a.enviados) * 100) : 0;
                  return (
                    <tr
                      key={p.id}
                      className="relative align-top transition-all duration-200 focus-within:bg-brand-50 hover:bg-brand-50 hover:shadow-md"
                    >
                      <td className="px-2 py-4">
                        {/* El enlace se extiende sobre toda la fila (after:inset-0): tocar cualquier parte abre el pedido. */}
                        <EnlaceFila
                          href={`/calidad/pedidos/${p.id}`}
                          className="group inline-flex items-center gap-2 text-sm font-semibold text-slate-900 outline-none after:absolute after:inset-0 hover:text-brand-700 focus-visible:after:ring-2 focus-visible:after:ring-brand-600 focus-visible:after:ring-inset"
                        >
                          {p.numero_pedido}
                        </EnlaceFila>
                        {a && a.enviados > 0 && (
                          <div
                            className="mt-2 flex items-center gap-2"
                            title={`${a.aprobados} de ${a.enviados} aprobados`}
                          >
                            <div className="h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-slate-200">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pctAprobado}%` }} />
                            </div>
                            <span className="text-xs font-medium tabular-nums text-slate-500">{pctAprobado}%</span>
                          </div>
                        )}
                        {p.cancelado_en && (
                          <span className="ml-2 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                            Cancelado
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-4 text-slate-600">{p.proyectos?.nombre ?? "—"}</td>
                      <td className="px-2 py-4 text-slate-700">{p.fecha_entrega ?? "—"}</td>
                      <td className="px-2 py-4">
                        {activa ? (
                          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-900">
                            #{activa.numero_version}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-2 py-4 text-right">
                        <Cifra valor={a?.enviados ?? 0} tono="bg-sky-100 text-sky-900" />
                      </td>
                      <td className="px-2 py-4 text-right">
                        <Cifra valor={a?.aprobados ?? 0} tono="bg-emerald-100 text-emerald-800" />
                      </td>
                      <td className="px-2 py-4 text-right">
                        <Cifra valor={a?.rechazados ?? 0} tono="bg-rose-100 text-rose-800" />
                      </td>
                      <td className="px-2 py-4 text-right">
                        <Cifra valor={sinEvaluar} tono="bg-amber-100 text-amber-800" />
                      </td>
                      <td className="px-2 py-4 text-right">
                        <Cifra valor={a?.enTaller ?? 0} tono="bg-slate-100 text-slate-700" />
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

// Cifra de la tabla: en pastilla de color si hay algo, y un guion tenue si no.
function Cifra({ valor, tono }: { valor: number; tono: string }) {
  if (!valor) return <span className="text-slate-300">—</span>;
  return (
    <span
      className={`inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 text-sm font-bold tabular-nums ${tono}`}
    >
      {valor}
    </span>
  );
}
