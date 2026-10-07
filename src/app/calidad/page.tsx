import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FiltrosOrdenesTrabajo, TablaOrdenesTrabajo } from "@/components/lista-ordenes-trabajo";
import {
  filtrarOrdenesTrabajo,
  hrefListaPedidos,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import Bienvenida from "@/components/bienvenida";
import ResumenInicio from "@/components/resumen-inicio";
import { avancePorPedido, sumarAvance, sumarAvanceDe } from "@/lib/resumen/avance-items";
import EstadoCalidad from "./estado-calidad";

// Igual que en Planeación y Producción: órdenes de trabajo con sus PM. Al
// entrar a una O.T. se ven sus PM con el avance de evaluación.
export default async function CalidadListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; anio?: string; cliente?: string; f?: string }>;
}) {
  const { q, anio, cliente, f } = await searchParams;
  const soloPorEvaluar = f === "por-evaluar";
  const busqueda = q?.trim() ?? "";
  const anioFiltro = anio && /^\d{4}$/.test(anio) ? Number(anio) : null;
  const clienteFiltro = cliente?.trim().toUpperCase() ?? "";
  const supabase = await createClient();

  // Pedidos y avance de evaluación (las tarjetas suman todo lo vigente) no
  // dependen entre sí: se piden a la vez.
  const avancePromesa = avancePorPedido(supabase, { conCalidad: true });
  const pedidosPromesa = supabase
    .from("pedidos")
    .select("id, numero_pedido, orden_trabajo, fecha_pedido, fecha_entrega, created_at, proyectos ( nombre, cliente )")
    .is("eliminado_en", null)
    // Eliminado definitivo con folios de Calidad: solo vive en Cancelados.
    .is("eliminado_definitivo_en", null)
    .order("created_at", { ascending: false })
    .returns<PedidoConOt[]>();

  const [{ data: pedidos, error }, avance] = await Promise.all([pedidosPromesa, avancePromesa]);

  const filtradas = filtrarOrdenesTrabajo(pedidos ?? [], {
    anio: anioFiltro,
    cliente: clienteFiltro,
    busqueda,
  });
  const { aniosDisponibles, clientesDisponibles } = filtradas;

  const total = sumarAvance(avance);
  const avanceDe = (fila: (typeof filtradas.filas)[number]) =>
    sumarAvanceDe(avance, fila.pedidos.map((p) => p.id));
  const otsConPendientes = filtradas.filas.filter((fila) => avanceDe(fila).porEvaluar > 0).length;
  const filas = filtradas.filas.filter((fila) => !soloPorEvaluar || avanceDe(fila).porEvaluar > 0);
  const totalOts = filas.filter((f) => f.ot).length;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida acciones={[{ href: "/calidad/folios", etiqueta: "Folios de calidad" }]} />
      <ResumenInicio
        tarjetas={[
          {
            valor: total.porEvaluar,
            etiqueta: "Ítems por evaluar",
            detalle: `en ${otsConPendientes} O.T.`,
            href: "/calidad?f=por-evaluar",
            tono: "atencion",
          },
          { valor: total.liberados, etiqueta: "Ítems en producción", detalle: "liberados por Producción", href: "/calidad" },
        ]}
      />
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Pedidos — Calidad
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Órdenes de trabajo con sus PM. Entra a una O.T. para ver sus PM y evaluar los ítems
            enviados a producción.
          </p>
        </div>
        {pedidos && pedidos.length > 0 && (
          <span className="whitespace-nowrap rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {totalOts} O.T.
          </span>
        )}
      </div>

      <form action="/calidad" className="flex gap-2">
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
            href={hrefListaPedidos("/calidad", {
              anio: anioFiltro ? String(anioFiltro) : undefined,
              cliente: clienteFiltro || undefined,
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
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no hay pedidos cargados.
        </p>
      )}

      {soloPorEvaluar && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          Mostrando solo las O.T. con ítems por evaluar ({filas.length}).
          <Link href="/calidad" className="font-medium underline-offset-2 hover:underline">
            Ver todas
          </Link>
        </p>
      )}

      <FiltrosOrdenesTrabajo
        base="/calidad"
        anios={aniosDisponibles}
        anio={anioFiltro}
        clientes={clientesDisponibles}
        cliente={clienteFiltro}
        q={busqueda || undefined}
      />

      {pedidos && pedidos.length > 0 && filas.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Ninguna O.T. coincide con los filtros.
        </p>
      )}

      {filas.length > 0 && (
        <TablaOrdenesTrabajo
          filas={filas}
          hrefOt={(ot) => `/calidad/ot/${encodeURIComponent(ot)}`}
          hrefPedido={(id) => `/calidad/pedidos/${id}`}
          columnaEstado={{
            titulo: "Evaluación",
            celda: (fila) => <EstadoCalidad cancelado={false} avance={avanceDe(fila)} />,
          }}
        />
      )}
    </main>
  );
}
