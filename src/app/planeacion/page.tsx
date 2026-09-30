import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeAdministrarPlaneacion } from "@/lib/auth/get-perfil";
import AccionesPedido from "./acciones-pedido";
import FiltroCliente from "./filtro-cliente";

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
}

// Una fila de la lista: una O.T. con sus PM, o un PM suelto (sin O.T.
// reconocible en su número).
interface FilaLista {
  ot: string | null;
  pedidos: PedidoRow[];
}

// Agrupa los PM por O.T. conservando el orden de la lista (la O.T. aparece
// donde está su PM más reciente).
function agruparPorOrdenTrabajo(pedidos: PedidoRow[]): FilaLista[] {
  const filas: FilaLista[] = [];
  const porOt = new Map<string, PedidoRow[]>();
  for (const p of pedidos) {
    if (!p.orden_trabajo) {
      filas.push({ ot: null, pedidos: [p] });
      continue;
    }
    let lista = porOt.get(p.orden_trabajo);
    if (!lista) {
      lista = [];
      porOt.set(p.orden_trabajo, lista);
      filas.push({ ot: p.orden_trabajo, pedidos: lista });
    }
    lista.push(p);
  }
  return filas;
}

// Año de un PM: el sufijo de su O.T. ("134-26" → 2026); si no tiene O.T.,
// el de la fecha del pedido o, en último caso, el de la carga.
function anioDePedido(p: PedidoRow): number {
  const sufijo = p.orden_trabajo?.match(/-(\d{2})$/);
  if (sufijo) return 2000 + Number(sufijo[1]);
  return Number((p.fecha_pedido ?? p.created_at).slice(0, 4));
}

// La búsqueda de O.T. compara contra el número de O.T., los números de PM,
// el proyecto y el cliente.
function coincideBusqueda(fila: FilaLista, texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    (fila.ot ?? "").toLowerCase().includes(t) ||
    fila.pedidos.some(
      (p) =>
        p.numero_pedido.toLowerCase().includes(t) ||
        (p.proyectos?.nombre ?? "").toLowerCase().includes(t) ||
        (p.proyectos?.cliente ?? "").toLowerCase().includes(t)
    )
  );
}

// Última fecha de entrega entre los PM de la O.T.
function ultimaEntrega(pedidos: PedidoRow[]): string | null {
  const fechas = pedidos.map((p) => p.fecha_entrega).filter((f): f is string => !!f);
  return fechas.length ? fechas.sort().at(-1)! : null;
}

// Cliente del PM tal como se compara en el filtro (sin espacios de más y
// en mayúsculas: el mismo cliente viene escrito distinto entre archivos).
function clienteDe(p: PedidoRow): string | null {
  const c = p.proyectos?.cliente?.replace(/\s+/g, " ").trim().toUpperCase();
  return c || null;
}

// Arma el href de la lista conservando los demás filtros.
function hrefLista(params: { q?: string; anio?: string; cliente?: string }): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.anio) qs.set("anio", params.anio);
  if (params.cliente) qs.set("cliente", params.cliente);
  const texto = qs.toString();
  return texto ? `/planeacion?${texto}` : "/planeacion";
}

const COLUMNAS =
  "id, numero_pedido, orden_trabajo, fecha_pedido, fecha_entrega, created_at, estado, eliminado_en, proyectos ( nombre, cliente )";

export default async function PlaneacionListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; anio?: string; cliente?: string }>;
}) {
  const { q, anio, cliente } = await searchParams;
  const busqueda = q?.trim() ?? "";
  const anioFiltro = anio && /^\d{4}$/.test(anio) ? Number(anio) : null;
  const clienteFiltro = cliente?.trim().toUpperCase() ?? "";
  // Filtros activos como texto, para los enlaces que conservan los demás.
  const anioParam = anioFiltro ? String(anioFiltro) : undefined;
  const clienteParam = clienteFiltro || undefined;
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

  const aniosDisponibles = [...new Set((pedidos ?? []).map(anioDePedido))].sort((a, b) => b - a);
  const clientesDisponibles = [
    ...new Set((pedidos ?? []).map(clienteDe).filter((c): c is string => !!c)),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const filas = agruparPorOrdenTrabajo(
    (pedidos ?? []).filter(
      (p) =>
        (!anioFiltro || anioDePedido(p) === anioFiltro) &&
        (!clienteFiltro || clienteDe(p) === clienteFiltro)
    )
  ).filter((fila) => !busqueda || coincideBusqueda(fila, busqueda));
  const totalOts = filas.filter((f) => f.ot).length;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Pedidos — Planeación
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Órdenes de trabajo con sus PM. Entra a una O.T. para ver sus pedidos y buscar modelos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pedidos && pedidos.length > 0 && (
            <span className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {totalOts} O.T.
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
        {clienteFiltro && <input type="hidden" name="cliente" value={clienteFiltro} />}
        <input
          type="search"
          name="q"
          defaultValue={busqueda}
          placeholder="Buscar O.T., PM, proyecto o cliente..."
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
            href={hrefLista({ anio: anioParam, cliente: clienteParam })}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-indigo-600 hover:underline"
          >
            Limpiar
          </Link>
        )}
      </form>

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
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Año</span>
            {[null, ...aniosDisponibles].map((a) => {
              const activo = a === anioFiltro;
              return (
                <Link
                  key={a ?? "todos"}
                  href={hrefLista({
                    q: busqueda || undefined,
                    anio: a ? String(a) : undefined,
                    cliente: clienteParam,
                  })}
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
          <FiltroCliente
            clientes={clientesDisponibles}
            valor={clienteFiltro}
            q={busqueda || undefined}
            anio={anioParam}
          />
        </div>
      )}

      {pedidos && pedidos.length > 0 && filas.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          {busqueda ? `Ninguna O.T. coincide con “${busqueda}”` : "No hay pedidos"}
          {clienteFiltro ? ` de ${clienteFiltro}` : ""}
          {anioFiltro ? ` en ${anioFiltro}` : ""}.
        </p>
      )}

      {filas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">O.T.</th>
                <th className="px-4 py-3">Proyecto</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">PM</th>
                <th className="px-4 py-3">Entrega</th>
                {esAdmin && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((fila) => {
                const primero = fila.pedidos[0];
                // Un PM suelto (sin O.T.) lleva directo a su detalle.
                const href = fila.ot
                  ? `/planeacion/ot/${encodeURIComponent(fila.ot)}`
                  : `/planeacion/pedidos/${primero.id}`;
                return (
                  <tr key={fila.ot ?? primero.id} className="align-top transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={href} className="group inline-flex items-center gap-2">
                        {fila.ot ? (
                          <span className="font-mono font-semibold text-slate-900 group-hover:text-indigo-600 group-hover:underline">
                            {fila.ot}
                          </span>
                        ) : (
                          <span className="font-medium text-slate-900 group-hover:text-indigo-600 group-hover:underline">
                            {primero.numero_pedido}
                          </span>
                        )}
                        <span className="text-slate-400 group-hover:text-indigo-600" aria-hidden>
                          →
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{primero.proyectos?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{primero.proyectos?.cliente ?? "—"}</td>
                    <td className="px-4 py-3">
                      {fila.ot ? (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {fila.pedidos.length} PM
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Sin O.T.</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{ultimaEntrega(fila.pedidos) ?? "—"}</td>
                    {esAdmin && (
                      <td className="px-4 py-3">
                        {!fila.ot && <AccionesPedido pedidoId={primero.id} eliminado={false} />}
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
