import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeAdministrarPlaneacion } from "@/lib/auth/get-perfil";
import AccionesPedido from "./acciones-pedido";
import PedidosEliminados from "./pedidos-eliminados";
import { FiltrosOrdenesTrabajo, TablaOrdenesTrabajo } from "@/components/lista-ordenes-trabajo";
import {
  agruparPorOrdenTrabajo,
  filtrarOrdenesTrabajo,
  hrefListaPedidos,
  ultimaEntrega,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import Bienvenida from "@/components/bienvenida";
import PendientesCuenta from "@/components/pendientes-cuenta";
import ResumenInicio from "@/components/resumen-inicio";
import EstadoVacio from "@/components/estado-vacio";
import { estadoEntrega, formatoFechaHora, hoyEnEmpresa } from "@/lib/resumen/entrega";
import FiltroRecordado from "@/components/filtro-recordado";
import {
  COOKIE_FILTRO_PEDIDOS,
  leerFiltroGuardado,
  type FiltroGuardado,
} from "@/lib/planeacion/filtro-guardado";
import AvanceOt from "./avance-ot";
import {
  avancePlaneacionPorPedido,
  sumarAvancePlan,
  type AvancePlan,
} from "@/lib/planeacion/avance-planeacion";
import { buscarMuebles } from "@/lib/produccion/buscar-muebles";
import ResultadosMuebles from "@/app/produccion/resultados-muebles";

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
  const perfil = await getPerfilActual(supabase);
  const esAdmin = puedeAdministrarPlaneacion(perfil);
  const filtroGuardado = leerFiltroGuardado((await cookies()).get(COOKIE_FILTRO_PEDIDOS)?.value);
  const filtroActual: FiltroGuardado = { anio: anioParam, cliente: clienteParam };

  // Con texto en el buscador se buscan también muebles y modelos en todos los
  // pedidos (no solo O.T., PM, proyecto o cliente).
  const busquedaMuebles = busqueda ? await buscarMuebles(supabase, busqueda) : null;

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

  // Avance de cada PM (liberados, en revisión, cancelados). Es un resumen: si
  // falla la consulta, la lista sigue sin la columna llena.
  const avance =
    pedidos && pedidos.length > 0
      ? await avancePlaneacionPorPedido(supabase).catch(() => new Map<string, AvancePlan>())
      : new Map<string, AvancePlan>();

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
  // Números de los atajos de entrega: sobre lo que dejan año, cliente y búsqueda.
  const conEntrega = (e: string) =>
    filtradas.filas.filter((fila) => estadoEntrega(ultimaEntrega(fila.pedidos), hoy) === e).length;
  const atajosEntrega: { valor: "semana" | "sin-fecha" | null; etiqueta: string }[] = [
    { valor: null, etiqueta: "Todas" },
    { valor: "semana", etiqueta: `Esta semana (${conEntrega("semana")})` },
    { valor: "sin-fecha", etiqueta: `Sin fecha (${conEntrega("sin-fecha")})` },
  ];
  const hayMuebles = (busquedaMuebles?.grupos.length ?? 0) > 0;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida />
      <PendientesCuenta />
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
            Entra a una O.T. para ver sus PM y buscar modelos.
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
        {entregaFiltro && <input type="hidden" name="entrega" value={entregaFiltro} />}
        <input
          type="search"
          name="q"
          defaultValue={busqueda}
          placeholder="Buscar O.T., PM, proyecto, cliente o modelo..."
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
            href={hrefListaPedidos("/planeacion", {
              anio: anioParam,
              cliente: clienteParam,
              entrega: entregaFiltro ?? undefined,
            })}
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

      <FiltroRecordado
        actual={filtroActual}
        guardado={filtroGuardado}
        href={hrefListaPedidos("/planeacion", { anio: filtroGuardado?.anio, cliente: filtroGuardado?.cliente })}
      />

      {pedidos && pedidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Entrega</span>
          {atajosEntrega.map((a) => {
            const activo = (entregaFiltro ?? null) === a.valor;
            return (
              <Link
                key={a.valor ?? "todas"}
                href={hrefListaPedidos("/planeacion", {
                  q: busqueda || undefined,
                  anio: anioParam,
                  cliente: clienteParam,
                  entrega: a.valor ?? undefined,
                })}
                aria-current={activo ? "true" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  activo
                    ? "border-brand-600 bg-brand-500 text-on-brand"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {a.etiqueta}
              </Link>
            );
          })}
        </div>
      )}

      <FiltrosOrdenesTrabajo
        base="/planeacion"
        anios={aniosDisponibles}
        anio={anioFiltro}
        clientes={clientesDisponibles}
        cliente={clienteFiltro}
        q={busqueda || undefined}
        entrega={entregaFiltro ?? undefined}
      />

      {/* Sin O.T. que coincidan pero con muebles encontrados, el aviso de
          abajo lo explica: no se dice "nada coincide". */}
      {pedidos && pedidos.length > 0 && filas.length === 0 && !hayMuebles && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          {busqueda ? `Ninguna O.T. ni modelo coincide con “${busqueda}”` : "No hay pedidos"}
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
          columnaEstado={{
            titulo: "Avance",
            celda: (fila) => <AvanceOt avance={sumarAvancePlan(avance, fila.pedidos.map((p) => p.id))} />,
          }}
          accion={
            esAdmin
              ? (fila) =>
                  !fila.ot && (
                    <AccionesPedido
                      pedidoId={fila.pedidos[0].id}
                      numeroPedido={fila.pedidos[0].numero_pedido}
                      eliminado={false}
                    />
                  )
              : undefined
          }
        />
      )}

      {busquedaMuebles && hayMuebles && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-600">Muebles y modelos</h2>
          <p className="text-sm text-slate-600">
            {busquedaMuebles.totalGrupos} mueble{busquedaMuebles.totalGrupos === 1 ? "" : "s"} encontrado
            {busquedaMuebles.totalGrupos === 1 ? "" : "s"} en todos los pedidos
            {busquedaMuebles.truncado ? " (primeros 40: afina la búsqueda)" : ""}. Haz clic en uno para ver
            sus componentes.
          </p>
          <ResultadosMuebles grupos={busquedaMuebles.grupos} area="planeacion" />
        </section>
      )}

      {/* Plegada por defecto: casi nunca se usa y no debe empujar la lista. */}
      {esAdmin && pedidosEliminados && pedidosEliminados.length > 0 && (
        <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900 [&::-webkit-details-marker]:hidden">
            <span>Pedidos eliminados ({pedidosEliminados.length})</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </summary>
          <div className="border-t border-slate-100">
            <PedidosEliminados
              pedidos={pedidosEliminados.map((p) => ({
                id: p.id,
                numero_pedido: p.numero_pedido,
                proyecto: p.proyectos?.nombre ?? "—",
                cliente: p.proyectos?.cliente ?? "—",
                eliminado_en: formatoFechaHora(p.eliminado_en),
              }))}
            />
          </div>
        </details>
      )}
    </main>
  );
}
