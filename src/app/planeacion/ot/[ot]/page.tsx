import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeAdministrarPlaneacion } from "@/lib/auth/get-perfil";
import TablaPedidos, { type PedidoLista } from "../../tabla-pedidos";
import { CLASE_MIGA, FlechaRegresar } from "@/components/regresar-estilo";

interface ResultadoModeloRow {
  id: string;
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
  pedido_versiones: {
    pedidos: { id: string; numero_pedido: string };
  };
}

const MAX_RESULTADOS_MODELO = 100;

// Escapa los comodines de LIKE para que el texto buscado se tome literal.
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Página de una O.T.: sus PM y un buscador de modelos en todos ellos.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ ot: string }>;
}): Promise<Metadata> {
  const { ot } = await params;
  return { title: `O.T. ${ot}` };
}

export default async function OrdenTrabajoPage({
  params,
  searchParams,
}: {
  params: Promise<{ ot: string }>;
  searchParams: Promise<{ modelo?: string }>;
}) {
  const { ot } = await params;
  // Formato de O.T. de la columna generada pedidos.orden_trabajo: "134-26".
  if (!/^\d+-\d{2}$/.test(ot)) {
    notFound();
  }
  const { modelo } = await searchParams;
  const busqueda = modelo?.trim() ?? "";
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const esAdmin = puedeAdministrarPlaneacion(perfil);
  const hrefOt = `/planeacion/ot/${encodeURIComponent(ot)}`;

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select(
      "id, numero_pedido, fecha_entrega, proyectos ( nombre, cliente ), pedido_versiones ( id, numero_version, es_version_activa )"
    )
    .eq("orden_trabajo", ot)
    .is("eliminado_en", null)
    .is("eliminado_definitivo_en", null)
    .returns<PedidoLista[]>();

  if (!error && (!pedidos || pedidos.length === 0)) {
    notFound();
  }

  const pms = (pedidos ?? []).sort((a, b) =>
    a.numero_pedido.localeCompare(b.numero_pedido, "es", { numeric: true })
  );
  const primero = pms[0];

  // Búsqueda de modelos: solo en la versión activa de los PM de esta O.T.,
  // sin ítems cancelados ni en papelera (los mismos que oculta el detalle).
  const { data: resultadosModelo, error: errorBusqueda } =
    busqueda && pms.length > 0
      ? await supabase
          .from("planeacion_items")
          .select(
            "id, item_code, modelo, descripcion, pedido_versiones!inner ( pedido_id, es_version_activa, pedidos!inner ( id, numero_pedido ) )"
          )
          .ilike("modelo", `%${escaparLike(busqueda)}%`)
          .eq("pedido_versiones.es_version_activa", true)
          .in(
            "pedido_versiones.pedido_id",
            pms.map((p) => p.id)
          )
          .or("estado_revision.is.null,estado_revision.neq.cancelado")
          .is("eliminacion_solicitada_en", null)
          .order("modelo")
          .order("item_code")
          .limit(MAX_RESULTADOS_MODELO)
          .returns<ResultadoModeloRow[]>()
      : { data: null, error: null };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <Link
          href="/planeacion"
          className={CLASE_MIGA}
        >
          <FlechaRegresar className="h-4 w-4" />
          Pedidos
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
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

      <form action={hrefOt} className="flex gap-2">
        <input
          type="search"
          name="modelo"
          defaultValue={busqueda}
          placeholder="Buscar modelo en los PM de esta O.T..."
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Buscar
        </button>
        {busqueda && (
          <Link
            href={hrefOt}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-brand-700 hover:underline"
          >
            Limpiar
          </Link>
        )}
      </form>

      {busqueda && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-600">
            Modelos que coinciden con &ldquo;{busqueda}&rdquo;
            {resultadosModelo
              ? ` (${resultadosModelo.length}${resultadosModelo.length === MAX_RESULTADOS_MODELO ? "+" : ""})`
              : ""}
          </h2>
          {errorBusqueda && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              No se pudo buscar: {errorBusqueda.message}
            </p>
          )}
          {resultadosModelo && resultadosModelo.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No se encontró ningún modelo en esta O.T.
            </p>
          )}
          {resultadosModelo && resultadosModelo.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Modelo</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Descripción</th>
                    <th className="px-4 py-3">PM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resultadosModelo.map((r) => {
                    const pedido = r.pedido_versiones.pedidos;
                    return (
                      <tr key={r.id} className="align-top transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{r.modelo}</td>
                        <td className="px-4 py-3 text-slate-700">{r.item_code}</td>
                        <td className="px-4 py-3 text-slate-700">{r.descripcion?.split("\n")[0]}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/planeacion/pedidos/${pedido.id}?modelo=${encodeURIComponent(busqueda)}`}
                            className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                          >
                            {pedido.numero_pedido}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pms.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-600">
            {pms.length} PM en esta O.T.
          </h2>
          <TablaPedidos pedidos={pms} esAdmin={esAdmin} />
        </div>
      )}
    </main>
  );
}
