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

  // Búsqueda de modelos: solo en la versión activa de pedidos no eliminados.
  const { data: resultadosModelo, error: errorBusqueda } = busqueda
    ? await supabase
        .from("planeacion_items")
        .select(
          "id, item_code, modelo, descripcion, pedido_versiones!inner ( numero_version, es_version_activa, pedidos!inner ( id, numero_pedido, eliminado_en, proyectos ( nombre ) ) )"
        )
        .ilike("modelo", `%${escaparLike(busqueda)}%`)
        .eq("pedido_versiones.es_version_activa", true)
        .is("pedido_versiones.pedidos.eliminado_en", null)
        .order("modelo")
        .limit(MAX_RESULTADOS_MODELO)
        .returns<ResultadoModeloRow[]>()
    : { data: null, error: null };

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

      <form action="/planeacion" className="flex gap-2">
        <input
          type="search"
          name="modelo"
          defaultValue={busqueda}
          placeholder="Buscar modelo..."
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded border border-black px-3 py-2 text-sm font-medium"
        >
          Buscar
        </button>
        {busqueda && (
          <Link
            href="/planeacion"
            className="rounded px-3 py-2 text-sm text-gray-500 underline"
          >
            Limpiar
          </Link>
        )}
      </form>

      {busqueda && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-600">
            Modelos que coinciden con &ldquo;{busqueda}&rdquo;
            {resultadosModelo ? ` (${resultadosModelo.length}${resultadosModelo.length === MAX_RESULTADOS_MODELO ? "+" : ""})` : ""}
          </h2>
          {errorBusqueda && (
            <p className="text-sm text-red-600">
              No se pudo buscar: {errorBusqueda.message}
            </p>
          )}
          {resultadosModelo && resultadosModelo.length === 0 && (
            <p className="text-sm text-gray-600">No se encontró ningún modelo.</p>
          )}
          {resultadosModelo && resultadosModelo.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-4">Modelo</th>
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4">Descripción</th>
                  <th className="py-2 pr-4">Pedido</th>
                  <th className="py-2 pr-4">Proyecto</th>
                </tr>
              </thead>
              <tbody>
                {resultadosModelo.map((r) => {
                  const pedido = r.pedido_versiones.pedidos;
                  return (
                    <tr key={r.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium">{r.modelo}</td>
                      <td className="py-2 pr-4">{r.item_code}</td>
                      <td className="py-2 pr-4">{r.descripcion?.split("\n")[0]}</td>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/planeacion/pedidos/${pedido.id}?modelo=${encodeURIComponent(busqueda)}`}
                          className="underline"
                        >
                          {pedido.numero_pedido}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{pedido.proyectos?.nombre ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

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
              {esAdmin && <th className="py-2 pr-4"></th>}
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
                  {esAdmin && (
                    <td className="py-2 pr-4">
                      <AccionesPedido pedidoId={p.id} eliminado={false} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {esAdmin && pedidosEliminados && pedidosEliminados.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-600">
            Pedidos eliminados ({pedidosEliminados.length})
          </h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-4">Pedido</th>
                <th className="py-2 pr-4">Proyecto</th>
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4">Eliminado el</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {pedidosEliminados.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 text-gray-500">
                  <td className="py-2 pr-4">{p.numero_pedido}</td>
                  <td className="py-2 pr-4">{p.proyectos?.nombre ?? "—"}</td>
                  <td className="py-2 pr-4">{p.proyectos?.cliente ?? "—"}</td>
                  <td className="py-2 pr-4">
                    {p.eliminado_en ? new Date(p.eliminado_en).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <AccionesPedido pedidoId={p.id} eliminado={true} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
