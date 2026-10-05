import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarMuebles } from "@/lib/produccion/buscar-muebles";
import ResultadosMuebles from "./resultados-muebles";
import Bienvenida from "@/components/bienvenida";
import ResumenInicio from "@/components/resumen-inicio";
import { avancePorPedido, sumarAvance } from "@/lib/resumen/avance-items";
import EstadoLiberacion from "./estado-liberacion";

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

export default async function ProduccionListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string }>;
}) {
  const { q, f } = await searchParams;
  const soloPorLiberar = f === "por-liberar";
  const consulta = (q ?? "").trim();
  const supabase = await createClient();

  // Con texto en el buscador se muestran muebles/modelos de todos los pedidos.
  const busqueda = consulta ? await buscarMuebles(supabase, consulta) : null;

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

  // Avance de liberación por pedido y totales para las tarjetas.
  const avance = await avancePorPedido(supabase, { conCalidad: false });
  const total = sumarAvance(avance);
  const conPendientes = [...avance.values()].filter((a) => a.porLiberar > 0).length;
  const visibles = (pedidos ?? []).filter(
    (p) => !soloPorLiberar || (avance.get(p.id)?.porLiberar ?? 0) > 0
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida acciones={[{ href: "/produccion/folios", etiqueta: "Folios de producción" }]} />
      <ResumenInicio
        tarjetas={[
          {
            valor: total.porLiberar,
            etiqueta: "Ítems por liberar",
            detalle: `en ${conPendientes} pedido${conPendientes === 1 ? "" : "s"}`,
            href: "/produccion?f=por-liberar",
            tono: "atencion",
          },
          { valor: total.liberados, etiqueta: "Ítems liberados", detalle: "ya enviados a producción" },
          { valor: (pedidos ?? []).filter((p) => !p.cancelado_en).length, etiqueta: "Pedidos vigentes", href: "/produccion" },
        ]}
      />
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Pedidos — Producción
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Selecciona un pedido para liberar sus ítems a producción y generar los viajeros.
          </p>
        </div>
        {pedidos && pedidos.length > 0 && (
          <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Buscador de muebles y modelos entre todos los pedidos: primero el
          mueble (ítem padre); al hacer clic se despliegan sus componentes. */}
      <form method="get" action="/produccion" className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-md">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            name="q"
            defaultValue={consulta}
            placeholder="Buscar mueble o modelo (ej. pérgola, PG-01, PRD-000123)"
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400"
        >
          Buscar
        </button>
        {consulta && (
          <Link href="/produccion" className="text-sm text-slate-500 underline hover:text-slate-700">
            Limpiar
          </Link>
        )}
      </form>

      {busqueda && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            {busqueda.totalGrupos === 0
              ? `Ningún mueble ni modelo coincide con "${consulta}".`
              : `${busqueda.totalGrupos} mueble${busqueda.totalGrupos === 1 ? "" : "s"} encontrado${
                  busqueda.totalGrupos === 1 ? "" : "s"
                } para "${consulta}"${
                  busqueda.truncado ? " — se muestran los primeros 40, afina la búsqueda para ver el resto" : ""
                }. Haz clic en un mueble para ver sus componentes.`}
          </p>
          {busqueda.grupos.length > 0 && <ResultadosMuebles grupos={busqueda.grupos} />}
        </section>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar los pedidos: {error.message}
        </p>
      )}

      {!busqueda && !error && (!pedidos || pedidos.length === 0) && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no hay pedidos cargados.
        </p>
      )}

      {!busqueda && soloPorLiberar && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          Mostrando solo los pedidos con ítems por liberar ({visibles.length}).
          <Link href="/produccion" className="font-medium underline-offset-2 hover:underline">
            Ver todos
          </Link>
        </p>
      )}

      {!busqueda && pedidos && pedidos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Proyecto</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Entrega</th>
                <th className="px-4 py-3">Liberación</th>
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
                        href={`/produccion/pedidos/${p.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {p.numero_pedido}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{p.proyectos?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{p.proyectos?.cliente ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{p.fecha_entrega ?? "—"}</td>
                    <td className="px-4 py-3">
                      <EstadoLiberacion cancelado={!!p.cancelado_en} avance={avance.get(p.id)} />
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
