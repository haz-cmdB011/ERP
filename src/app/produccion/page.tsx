import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarMuebles } from "@/lib/produccion/buscar-muebles";
import { FiltrosOrdenesTrabajo, TablaOrdenesTrabajo } from "@/components/lista-ordenes-trabajo";
import {
  filtrarOrdenesTrabajo,
  hrefListaPedidos,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import ResultadosMuebles from "./resultados-muebles";

// Igual que en Planeación: órdenes de trabajo con sus PM. Al entrar a una O.T.
// se ven sus PM; el buscador además encuentra muebles y modelos en todos los
// pedidos.
export default async function ProduccionListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; anio?: string; cliente?: string }>;
}) {
  const { q, anio, cliente } = await searchParams;
  const consulta = (q ?? "").trim();
  const anioFiltro = anio && /^\d{4}$/.test(anio) ? Number(anio) : null;
  const clienteFiltro = cliente?.trim().toUpperCase() ?? "";
  const supabase = await createClient();

  // Con texto en el buscador se muestran también muebles/modelos de todos los pedidos.
  const busqueda = consulta ? await buscarMuebles(supabase, consulta) : null;

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select("id, numero_pedido, orden_trabajo, fecha_pedido, fecha_entrega, created_at, proyectos ( nombre, cliente )")
    .is("eliminado_en", null)
    // Eliminado definitivo con folios de Calidad: solo vive en Cancelados.
    .is("eliminado_definitivo_en", null)
    .order("created_at", { ascending: false })
    .returns<PedidoConOt[]>();

  const { filas, aniosDisponibles, clientesDisponibles } = filtrarOrdenesTrabajo(pedidos ?? [], {
    anio: anioFiltro,
    cliente: clienteFiltro,
    busqueda: consulta,
  });
  const totalOts = filas.filter((f) => f.ot).length;
  const hayFiltros = !!(consulta || anioFiltro || clienteFiltro);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Pedidos — Producción
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Órdenes de trabajo con sus PM. Entra a una O.T. para ver sus PM, liberar ítems, generar
            viajeros y asignar a equipos.
          </p>
        </div>
        {pedidos && pedidos.length > 0 && (
          <span className="whitespace-nowrap rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {totalOts} O.T.
          </span>
        )}
      </div>

      <form method="get" action="/produccion" className="flex flex-wrap items-center gap-2">
        {anioFiltro && <input type="hidden" name="anio" value={anioFiltro} />}
        {clienteFiltro && <input type="hidden" name="cliente" value={clienteFiltro} />}
        <div className="relative min-w-0 flex-1">
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
            placeholder="Buscar O.T., PM, cliente, mueble o modelo (ej. 134-26, pérgola, PRD-000123)"
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
        >
          Buscar
        </button>
        {consulta && (
          <Link
            href={hrefListaPedidos("/produccion", {
              anio: anioFiltro ? String(anioFiltro) : undefined,
              cliente: clienteFiltro || undefined,
            })}
            className="text-sm text-slate-500 underline hover:text-slate-700"
          >
            Limpiar
          </Link>
        )}
      </form>

      <FiltrosOrdenesTrabajo
        base="/produccion"
        anios={aniosDisponibles}
        anio={anioFiltro}
        clientes={clientesDisponibles}
        cliente={clienteFiltro}
        q={consulta || undefined}
      />

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

      {pedidos && pedidos.length > 0 && (
        <section className="flex flex-col gap-3">
          {consulta && (
            <h2 className="text-sm font-semibold text-slate-600">
              Órdenes de trabajo que coinciden con &ldquo;{consulta}&rdquo;
            </h2>
          )}
          {filas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              {hayFiltros ? "Ninguna O.T. coincide con los filtros." : "No hay pedidos."}
            </p>
          ) : (
            <TablaOrdenesTrabajo
              filas={filas}
              hrefOt={(ot) => `/produccion/ot/${encodeURIComponent(ot)}`}
              hrefPedido={(id) => `/produccion/pedidos/${id}`}
            />
          )}
        </section>
      )}

      {busqueda && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-600">Muebles y modelos</h2>
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
    </main>
  );
}
