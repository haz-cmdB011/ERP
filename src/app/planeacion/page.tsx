import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeAdministrarPlaneacion } from "@/lib/auth/get-perfil";
import AccionesPedido from "./acciones-pedido";
import { FiltrosOrdenesTrabajo, TablaOrdenesTrabajo } from "@/components/lista-ordenes-trabajo";
import {
  agruparPorOrdenTrabajo,
  filtrarOrdenesTrabajo,
  hrefListaPedidos,
  ultimaEntrega,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import Bienvenida from "@/components/bienvenida";
import ResumenInicio from "@/components/resumen-inicio";
import EstadoVacio from "@/components/estado-vacio";
import { estadoEntrega, hoyEnEmpresa } from "@/lib/resumen/entrega";

interface PedidoRow extends PedidoConOt {
  estado: string;
  eliminado_en: string | null;
}

const COLUMNAS =
  "id, numero_pedido, orden_trabajo, fecha_pedido, fecha_entrega, created_at, estado, eliminado_en, proyectos ( nombre, cliente )";

export default async function PlaneacionListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; anio?: string; cliente?: string; entrega?: string }>;
}) {
  const { q, anio, cliente, entrega } = await searchParams;
  const entregaFiltro = entrega === "semana" || entrega === "sin-fecha" ? entrega : null;
  const hoy = hoyEnEmpresa();
  const busqueda = q?.trim() ?? "";
  const anioFiltro = anio && /^\d{4}$/.test(anio) ? Number(anio) : null;
  const clienteFiltro = cliente?.trim().toUpperCase() ?? "";
  // Filtros activos como texto, para los enlaces que conservan los demás.
  const anioParam = anioFiltro ? String(anioFiltro) : undefined;
  const clienteParam = clienteFiltro || undefined;
  const supabase = await createClient();
  // El perfil y la lista de pedidos no dependen entre sí: se piden a la vez. La
  // papelera sí necesita saber antes si es administrador.
  const perfilPromesa = getPerfilActual(supabase);
  const pedidosPromesa = supabase
    .from("pedidos")
    .select(COLUMNAS)
    .is("eliminado_en", null)
    // Eliminado definitivo con folios de Calidad: solo vive en Cancelados.
    .is("eliminado_definitivo_en", null)
    .order("created_at", { ascending: false })
    .returns<PedidoRow[]>();

  const [perfil, { data: pedidos, error }] = await Promise.all([perfilPromesa, pedidosPromesa]);
  const esAdmin = puedeAdministrarPlaneacion(perfil);

  const { data: pedidosEliminados } = esAdmin
    ? await supabase
        .from("pedidos")
        .select(COLUMNAS)
        .not("eliminado_en", "is", null)
        .order("eliminado_en", { ascending: false })
        .returns<PedidoRow[]>()
    : { data: null };

  const filtradas = filtrarOrdenesTrabajo(pedidos ?? [], {
    anio: anioFiltro,
    cliente: clienteFiltro,
    busqueda,
  });
  const { aniosDisponibles, clientesDisponibles } = filtradas;
  const filas = filtradas.filas.filter(
    (fila) => !entregaFiltro || estadoEntrega(ultimaEntrega(fila.pedidos), hoy) === entregaFiltro
  );
  const totalOts = filas.filter((f) => f.ot).length;

  // Números de las tarjetas: sobre todas las O.T. vigentes, sin filtros.
  const todas = agruparPorOrdenTrabajo(pedidos ?? []);
  const conEstado = (e: string) =>
    todas.filter((fila) => estadoEntrega(ultimaEntrega(fila.pedidos), hoy) === e).length;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida />
      {pedidos && pedidos.length > 0 && (
        <ResumenInicio
          tarjetas={[
            { valor: todas.length, etiqueta: "O.T. vigentes", detalle: `${pedidos.length} PM en total`, href: "/planeacion" },
            {
              valor: conEstado("semana"),
              etiqueta: "Entregan esta semana",
              detalle: "en los próximos 7 días",
              href: "/planeacion?entrega=semana",
              tono: "atencion",
            },
            { valor: conEstado("mes"), etiqueta: "Entregan este mes", detalle: "entre 8 y 30 días" },
            {
              valor: conEstado("sin-fecha"),
              etiqueta: "Sin fecha de entrega",
              detalle: "conviene completarla",
              href: "/planeacion?entrega=sin-fecha",
            },
          ]}
        />
      )}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
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
            <span className="whitespace-nowrap rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {totalOts} O.T.
            </span>
          )}
          <Link
            href="/planeacion/upload"
            className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400"
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
            href={hrefListaPedidos("/planeacion", { anio: anioParam, cliente: clienteParam })}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-brand-700 hover:underline"
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
        <EstadoVacio
          titulo="Todavía no hay pedidos"
          descripcion="Sube el primer Excel de Planeación para empezar a ver las órdenes de trabajo aquí."
          accion={{ href: "/planeacion/upload", etiqueta: "Cargar Excel" }}
        />
      )}

      {entregaFiltro && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          {entregaFiltro === "semana"
            ? "Mostrando solo las O.T. que entregan en los próximos 7 días"
            : "Mostrando solo las O.T. sin fecha de entrega"}{" "}
          ({filas.length}).
          <Link href="/planeacion" className="font-medium underline-offset-2 hover:underline">
            Ver todas
          </Link>
        </p>
      )}

      <FiltrosOrdenesTrabajo
        base="/planeacion"
        anios={aniosDisponibles}
        anio={anioFiltro}
        clientes={clientesDisponibles}
        cliente={clienteFiltro}
        q={busqueda || undefined}
      />

      {pedidos && pedidos.length > 0 && filas.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          {busqueda ? `Ninguna O.T. coincide con “${busqueda}”` : "No hay pedidos"}
          {clienteFiltro ? ` de ${clienteFiltro}` : ""}
          {anioFiltro ? ` en ${anioFiltro}` : ""}.
        </p>
      )}

      {filas.length > 0 && (
        <TablaOrdenesTrabajo
          filas={filas}
          hoy={hoy}
          hrefOt={(ot) => `/planeacion/ot/${encodeURIComponent(ot)}`}
          hrefPedido={(id) => `/planeacion/pedidos/${id}`}
          accion={
            esAdmin
              ? (fila) =>
                  !fila.ot && <AccionesPedido pedidoId={fila.pedidos[0].id} eliminado={false} />
              : undefined
          }
        />
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
