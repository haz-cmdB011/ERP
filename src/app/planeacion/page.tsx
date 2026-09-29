import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeAdministrarPlaneacion } from "@/lib/auth/get-perfil";
import AccionesPedido from "./acciones-pedido";
import TablaPedidos from "./tabla-pedidos";

interface PedidoRow {
  id: string;
  numero_pedido: string;
  // "134-26" para 1PM134-26, 2PM134-26... (columna generada); agrupa los PM.
  orden_trabajo: string | null;
  fecha_pedido: string | null;
  fecha_entrega: string | null;
  created_at: string;
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

// Agrupa los PM por Orden de Trabajo conservando el orden de la lista (la
// OT aparece donde está su PM más reciente). Los PM sin OT reconocible van
// cada uno en su propio grupo sin encabezado. Dentro de una OT, por número.
function agruparPorOrdenTrabajo(pedidos: PedidoRow[]): { ot: string | null; pedidos: PedidoRow[] }[] {
  const grupos: { ot: string | null; pedidos: PedidoRow[] }[] = [];
  const porOt = new Map<string, PedidoRow[]>();
  for (const p of pedidos) {
    if (!p.orden_trabajo) {
      grupos.push({ ot: null, pedidos: [p] });
      continue;
    }
    let lista = porOt.get(p.orden_trabajo);
    if (!lista) {
      lista = [];
      porOt.set(p.orden_trabajo, lista);
      grupos.push({ ot: p.orden_trabajo, pedidos: lista });
    }
    lista.push(p);
  }
  for (const lista of porOt.values()) {
    lista.sort((a, b) => a.numero_pedido.localeCompare(b.numero_pedido, "es", { numeric: true }));
  }
  return grupos;
}

// Año de un PM: el sufijo de su O.T. ("134-26" → 2026); si no tiene O.T.,
// el de la fecha del pedido o, en último caso, el de la carga.
function anioDePedido(p: PedidoRow): number {
  const sufijo = p.orden_trabajo?.match(/-(\d{2})$/);
  if (sufijo) return 2000 + Number(sufijo[1]);
  return Number((p.fecha_pedido ?? p.created_at).slice(0, 4));
}

// Arma el href de la lista conservando los demás filtros.
function hrefLista(params: { modelo?: string; anio?: string }): string {
  const qs = new URLSearchParams();
  if (params.modelo) qs.set("modelo", params.modelo);
  if (params.anio) qs.set("anio", params.anio);
  const texto = qs.toString();
  return texto ? `/planeacion?${texto}` : "/planeacion";
}

// Escapa los comodines de LIKE para que el texto buscado se tome literal.
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const COLUMNAS =
  "id, numero_pedido, orden_trabajo, fecha_pedido, fecha_entrega, created_at, estado, eliminado_en, proyectos ( nombre, cliente ), pedido_versiones ( id, numero_version, es_version_activa )";

export default async function PlaneacionListPage({
  searchParams,
}: {
  searchParams: Promise<{ modelo?: string; anio?: string }>;
}) {
  const { modelo, anio } = await searchParams;
  const busqueda = modelo?.trim() ?? "";
  const anioFiltro = anio && /^\d{4}$/.test(anio) ? Number(anio) : null;
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const esAdmin = puedeAdministrarPlaneacion(perfil);

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select(COLUMNAS)
    .is("eliminado_en", null)
    // Eliminado definitivo con folios de Calidad: solo vive en Cancelados.
    .is("eliminado_definitivo_en", null)
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
          "id, item_code, modelo, descripcion, pedido_versiones!inner ( numero_version, es_version_activa, pedidos!inner ( id, numero_pedido, eliminado_en, eliminado_definitivo_en, proyectos ( nombre ) ) )"
        )
        .ilike("modelo", `%${escaparLike(busqueda)}%`)
        .eq("pedido_versiones.es_version_activa", true)
        .is("pedido_versiones.pedidos.eliminado_en", null)
        .is("pedido_versiones.pedidos.eliminado_definitivo_en", null)
        .or("estado_revision.is.null,estado_revision.neq.cancelado")
        .is("eliminacion_solicitada_en", null)
        .order("modelo")
        .order("item_code")
        .limit(MAX_RESULTADOS_MODELO)
        .returns<ResultadoModeloRow[]>()
    : { data: null, error: null };

  const aniosDisponibles = [...new Set((pedidos ?? []).map(anioDePedido))].sort((a, b) => b - a);
  const pedidosFiltrados = anioFiltro
    ? (pedidos ?? []).filter((p) => anioDePedido(p) === anioFiltro)
    : pedidos ?? [];

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
            <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {pedidosFiltrados.length} pedido{pedidosFiltrados.length === 1 ? "" : "s"}
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
        {anioFiltro && <input type="hidden" name="anio" value={anioFiltro} />}
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
            href={hrefLista({ anio: anioFiltro ? String(anioFiltro) : undefined })}
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

      {aniosDisponibles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Año</span>
          {[null, ...aniosDisponibles].map((a) => {
            const activo = a === anioFiltro;
            return (
              <Link
                key={a ?? "todos"}
                href={hrefLista({ modelo: busqueda || undefined, anio: a ? String(a) : undefined })}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  activo
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {a ?? "Todos"}
              </Link>
            );
          })}
        </div>
      )}

      {pedidos && pedidos.length > 0 && pedidosFiltrados.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          No hay pedidos de {anioFiltro}.
        </p>
      )}

      {pedidosFiltrados.length > 0 && (
        <TablaPedidos grupos={agruparPorOrdenTrabajo(pedidosFiltrados)} esAdmin={esAdmin} />
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
