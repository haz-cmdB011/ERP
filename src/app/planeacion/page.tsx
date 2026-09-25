import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeAdministrarPlaneacion } from "@/lib/auth/get-perfil";
import AccionesPedido from "./acciones-pedido";

interface PedidoRow {
  id: string;
  numero_pedido: string;
  fecha_pedido: string | null;
  fecha_entrega: string | null;
  estado: string;
  eliminado_en: string | null;
  proyectos: { nombre: string; cliente: string } | null;
  pedido_versiones: { id: string; numero_version: number; es_version_activa: boolean }[];
}

interface ResultadoModeloRow {
  id: string;
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
  pedido_versiones: {
    numero_version: number;
    pedidos: {
      id: string;
      numero_pedido: string;
      proyectos: { nombre: string } | null;
    };
  };
}

const MAX_RESULTADOS_MODELO = 100;

// Escapa los comodines de LIKE para que el texto buscado se tome literal.
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const COLUMNAS =
  "id, numero_pedido, fecha_pedido, fecha_entrega, estado, eliminado_en, proyectos ( nombre, cliente ), pedido_versiones ( id, numero_version, es_version_activa )";

export default async function PlaneacionListPage({
  searchParams,
}: {
  searchParams: Promise<{ modelo?: string }>;
}) {
  const { modelo } = await searchParams;
  const busqueda = modelo?.trim() ?? "";
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const esAdmin = puedeAdministrarPlaneacion(perfil);

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select(COLUMNAS)
    .is("eliminado_en", null)
    .order("created_at", { ascending: false })
    .returns<PedidoRow[]>();

  const { data: pedidosEliminados } = esAdmin
    ? await supabase
        .from("pedidos")
        .select(COLUMNAS)
        .not("eliminado_en", "is", null)
        .order("eliminado_en", { ascending: false })
        .returns<PedidoRow[]>()
    : { data: null };

  // Búsqueda de modelos: solo en la versión activa de pedidos no eliminados,
  // sin ítems cancelados ni en papelera (los mismos que oculta el detalle).
  const { data: resultadosModelo, error: errorBusqueda } = busqueda
    ? await supabase
        .from("planeacion_items")
        .select(
          "id, item_code, modelo, descripcion, pedido_versiones!inner ( numero_version, es_version_activa, pedidos!inner ( id, numero_pedido, eliminado_en, proyectos ( nombre ) ) )"
        )
        .ilike("modelo", `%${escaparLike(busqueda)}%`)
        .eq("pedido_versiones.es_version_activa", true)
        .is("pedido_versiones.pedidos.eliminado_en", null)
        .or("estado_revision.is.null,estado_revision.neq.cancelado")
        .is("eliminacion_solicitada_en", null)
        .order("modelo")
        .limit(MAX_RESULTADOS_MODELO)
        .returns<ResultadoModeloRow[]>()
    : { data: null, error: null };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Pedidos — Planeación
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Consulta los pedidos cargados, sus versiones y el estado de revisión de cada ítem.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pedidos && pedidos.length > 0 && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"}
            </span>
          )}
          <Link
            href="/planeacion/upload"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
          >
            Cargar Excel
          </Link>
        </div>
      </div>

      <form action="/planeacion" className="flex gap-2">
        <input
          type="search"
          name="modelo"
          defaultValue={busqueda}
          placeholder="Buscar modelo..."
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Buscar
        </button>
        {busqueda && (
          <Link
            href="/planeacion"
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-indigo-600 hover:underline"
          >
            Limpiar
          </Link>
        )}
      </form>

      {busqueda && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-600">
            Modelos que coinciden con &ldquo;{busqueda}&rdquo;
            {resultadosModelo ? ` (${resultadosModelo.length}${resultadosModelo.length === MAX_RESULTADOS_MODELO ? "+" : ""})` : ""}
          </h2>
          {errorBusqueda && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              No se pudo buscar: {errorBusqueda.message}
            </p>
          )}
          {resultadosModelo && resultadosModelo.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No se encontró ningún modelo.
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
                    <th className="px-4 py-3">Pedido</th>
                    <th className="px-4 py-3">Proyecto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resultadosModelo.map((r) => {
                    const pedido = r.pedido_versiones.pedidos;
                    return (
                      <tr key={r.id} className="align-top transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{r.modelo}</td>
                        <td className="px-4 py-3 text-slate-700">{r.item_code}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {r.descripcion?.split("\n")[0]}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/planeacion/pedidos/${pedido.id}?modelo=${encodeURIComponent(busqueda)}`}
                            className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                          >
                            {pedido.numero_pedido}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{pedido.proyectos?.nombre ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar los pedidos: {error.message}
        </p>
      )}

      {!error && (!pedidos || pedidos.length === 0) && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no hay pedidos cargados. Sube el primer Excel de Planeación para empezar.
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
                <th className="px-4 py-3">Versión activa</th>
                {esAdmin && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pedidos.map((p) => {
                const activa = p.pedido_versiones.find((v) => v.es_version_activa);
                return (
                  <tr key={p.id} className="align-top transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/planeacion/pedidos/${p.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                      >
                        {p.numero_pedido}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{p.proyectos?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{p.proyectos?.cliente ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{p.fecha_entrega ?? "—"}</td>
                    <td className="px-4 py-3">
                      {activa ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          #{activa.numero_version}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    {esAdmin && (
                      <td className="px-4 py-3">
                        <AccionesPedido pedidoId={p.id} eliminado={false} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {esAdmin && pedidosEliminados && pedidosEliminados.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-600">
            Pedidos eliminados ({pedidosEliminados.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Proyecto</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Eliminado el</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pedidosEliminados.map((p) => (
                  <tr key={p.id} className="align-top text-slate-500">
                    <td className="px-4 py-3 font-medium">{p.numero_pedido}</td>
                    <td className="px-4 py-3">{p.proyectos?.nombre ?? "—"}</td>
                    <td className="px-4 py-3">{p.proyectos?.cliente ?? "—"}</td>
                    <td className="px-4 py-3">
                      {p.eliminado_en ? new Date(p.eliminado_en).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <AccionesPedido pedidoId={p.id} eliminado={true} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
