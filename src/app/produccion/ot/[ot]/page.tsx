import Link from "next/link";
import Migas from "@/components/migas";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { traerTodo } from "@/lib/supabase/traer-todo";
import { ErrorLectura } from "@/lib/supabase/paginar";

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

  const [{ data: muebles, error: errorMuebles }, { data: enTaller, error: errorEnTaller }] = await Promise.all([
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
      : Promise.resolve({ data: [] as MuebleConteo[], error: null }),
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
  // Conteos incompletos parecerían reales (menos muebles liberados de los que hay): mejor el aviso
  // con "Reintentar" que números que no cuadran.
  if (errorMuebles || errorEnTaller) {
    throw new ErrorLectura(
      `No se pudo leer el avance de la O.T.: ${errorMuebles ?? errorEnTaller?.message}`
    );
  }

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
      <Migas items={[{ etiqueta: "Pedidos", href: "/produccion" }, { etiqueta: `O.T. ${ot}` }]} />
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          O.T. <span className="font-mono">{ot}</span>
        </h1>
        {primero && (
          <p className="text-sm text-slate-600">
            {primero.proyectos?.nombre} — {primero.proyectos?.cliente}
          </p>
        )}
        <p className="mt-1 text-sm text-slate-500">
          Abre un pedido (PM) para ver sus muebles liberados y asignarlos.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar los pedidos: {error.message}
        </p>
      )}

      {pms.length > 0 && (
        <ul className="lista-animada flex flex-col gap-3">
          {pms.map((p) => {
            const activa = versionActiva.get(p.id);
            const conteo = activa ? conteoMuebles.get(activa.id) : undefined;
            const taller = enTallerPorPedido.get(p.id) ?? 0;
            const pct = conteo && conteo.total > 0 ? Math.round((conteo.liberados / conteo.total) * 100) : 0;
            return (
              <li
                key={p.id}
                className="relative flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md sm:min-h-[6.5rem] sm:flex-row sm:items-center sm:justify-between"
              >
                {/* Toda la tarjeta abre el pedido. */}
                <Link
                  href={`/produccion/pedidos/${p.id}`}
                  aria-label={`Abrir el pedido ${p.numero_pedido}`}
                  className="absolute inset-0 rounded-xl focus-visible:outline-brand-500"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-slate-900">{p.numero_pedido}</span>
                    {p.cancelado_en && (
                      <span className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        Cancelado
                      </span>
                    )}
                    {activa && activa.numero_version > 1 && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        Versión {activa.numero_version}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-700">{p.proyectos?.nombre ?? "—"}</p>
                  <p className="text-xs text-slate-500">Entrega: {p.fecha_entrega ?? "—"}</p>
                </div>
                <div className="flex flex-col gap-1 text-sm text-slate-700 sm:w-56">
                  {conteo ? (
                    <>
                      <p>
                        <span className="font-semibold">{conteo.liberados}</span> de {conteo.total} muebles liberados
                      </p>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="text-slate-500">Sin muebles todavía</p>
                  )}
                  {taller > 0 && (
                    <p className="text-xs text-slate-500">
                      {taller} asignaci{taller === 1 ? "ón" : "ones"} en taller
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

      )}
    </main>
  );
}
