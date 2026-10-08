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
import { cargarResumenCalidad } from "@/lib/calidad/resumen-db";
import { detallePorEvaluar, type ResumenCalidad } from "@/lib/calidad/resumen";
import type { AvancePedido } from "@/lib/resumen/avance-items";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import { paginarTodo } from "@/lib/supabase/paginar";
import { cargarDetenidos } from "@/lib/produccion/detenidos-db";
import { DIAS_SIN_EVALUAR_LOTE, avisoDetenidos } from "@/lib/produccion/detenidos";
import EstadoCalidad from "./estado-calidad";

// Igual que en Planeación y Producción: órdenes de trabajo con sus PM. Al
// entrar a una O.T. se ven sus PM con el avance de evaluación.
export default async function CalidadListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; anio?: string; cliente?: string; f?: string }>;
}) {
  const { q, anio, cliente, f } = await searchParams;
  const filtroEstado = f === "por-evaluar" || f === "reinspeccion" ? f : null;
  const busqueda = q?.trim() ?? "";
  const anioFiltro = anio && /^\d{4}$/.test(anio) ? Number(anio) : null;
  const clienteFiltro = cliente?.trim().toUpperCase() ?? "";
  const supabase = await createClient();

  // Los pedidos y el resumen de evaluación no dependen entre sí: se piden a la vez.
  // Pedidos: todos, por páginas (la API corta en 1000); si la lectura falla se lanza y
  // la pantalla ofrece "Reintentar" en vez de mostrar una lista corta. Resumen de
  // evaluación (por evaluar, antiguos, por reinspeccionar, tasa de aprobación): si no
  // se pudo calcular se avisa en vez de mostrar ceros que parezcan reales.
  const [pedidos, resumen, detenidos] = await Promise.all([
    paginarTodo<PedidoConOt>(
      (desde, hasta) =>
        supabase
          .from("pedidos")
          .select("id, numero_pedido, orden_trabajo, fecha_pedido, fecha_entrega, created_at, proyectos ( nombre, cliente )")
          .is("eliminado_en", null)
          // Eliminado definitivo con folios de Calidad: solo vive en Cancelados.
          .is("eliminado_definitivo_en", null)
          .order("created_at", { ascending: false })
          .order("id")
          .range(desde, hasta)
          .returns<PedidoConOt[]>(),
      { contexto: "los pedidos" }
    ),
    cargarResumenCalidad(supabase).catch((): ResumenCalidad | null => null),
    // Lotes que esperan a Calidad: si falla, la pantalla sigue sin esa tarjeta.
    cargarDetenidos(supabase, hoyMexico()).catch(() => null),
  ]);

  const filtradas = filtrarOrdenesTrabajo(pedidos, {
    anio: anioFiltro,
    cliente: clienteFiltro,
    busqueda,
  });
  const { aniosDisponibles, clientesDisponibles } = filtradas;

  const sinResumen = resumen === null;
  const pedidoIdsDe = (fila: (typeof filtradas.filas)[number]) => fila.pedidos.map((p) => p.id);
  // Avance de una O.T. con la forma que espera la etiqueta de estado.
  const avanceDe = (fila: (typeof filtradas.filas)[number]): AvancePedido => {
    const suma = { total: 0, liberados: 0, porLiberar: 0, evaluados: 0, porEvaluar: 0 };
    for (const id of pedidoIdsDe(fila)) {
      const r = resumen?.porPedido.get(id);
      if (!r) continue;
      suma.total += r.liberados;
      suma.liberados += r.liberados;
      suma.evaluados += r.evaluados;
      suma.porEvaluar += r.porEvaluar;
    }
    return suma;
  };
  const reinspeccionDe = (fila: (typeof filtradas.filas)[number]) =>
    pedidoIdsDe(fila).reduce((n, id) => n + (resumen?.porPedido.get(id)?.porReinspeccionar ?? 0), 0);
  const otsConPendientes = filtradas.filas.filter((fila) => avanceDe(fila).porEvaluar > 0).length;
  const otsConReinspeccion = filtradas.filas.filter((fila) => reinspeccionDe(fila) > 0).length;
  const filas = filtradas.filas.filter(
    (fila) =>
      !filtroEstado ||
      (filtroEstado === "por-evaluar" ? avanceDe(fila).porEvaluar > 0 : reinspeccionDe(fila) > 0)
  );
  const totalOts = filas.filter((f) => f.ot).length;
  const hoy = hoyMexico();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida acciones={[{ href: "/calidad/folios", etiqueta: "Folios de calidad" }]} />
      {sinResumen ? (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No se pudieron calcular los números del panel. Recarga la página para reintentar; la lista de
          abajo sí está completa.
        </p>
      ) : (
        <ResumenInicio
          tarjetas={[
            ...(detenidos
              ? [
                  {
                    valor: detenidos.sinEvaluar.total,
                    etiqueta: "Lotes por evaluar",
                    detalle: "entregas que Producción ya verificó",
                    href: "/calidad/entregas",
                    tono: "atencion" as const,
                    alerta: avisoDetenidos(detenidos.sinEvaluar, DIAS_SIN_EVALUAR_LOTE),
                  },
                ]
              : []),
            {
              valor: resumen!.porEvaluar,
              etiqueta: "Ítems por evaluar",
              detalle: `en ${otsConPendientes} O.T. · ${detallePorEvaluar(resumen!)}`,
              href: "/calidad?f=por-evaluar",
              tono: "atencion",
            },
            {
              valor: resumen!.porReinspeccionar,
              etiqueta: "Por reinspeccionar",
              detalle: `no aprobados, en ${otsConReinspeccion} O.T.`,
              href: "/calidad?f=reinspeccion",
              tono: "atencion",
            },
            {
              valor: resumen!.tasaAprobacion ?? 0,
              etiqueta: "% de aprobación",
              detalle:
                resumen!.tasaAprobacion === null
                  ? "sin evaluaciones en 30 días"
                  : `${resumen!.evaluaciones30d} evaluaciones en 30 días`,
              tono: "suave",
            },
            {
              valor: resumen!.liberados,
              etiqueta: "Ítems en producción",
              detalle: "liberados por Producción",
              href: "/calidad",
              tono: "suave",
            },
          ]}
        />
      )}
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
        {pedidos.length > 0 && (
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

      {pedidos.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no hay pedidos cargados.
        </p>
      )}

      {filtroEstado && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          {filtroEstado === "por-evaluar"
            ? "Mostrando solo las O.T. con ítems por evaluar"
            : "Mostrando solo las O.T. con ítems no aprobados por reinspeccionar"}{" "}
          ({filas.length}).
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

      {pedidos.length > 0 && filas.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Ninguna O.T. coincide con los filtros.
        </p>
      )}

      {filas.length > 0 && (
        <TablaOrdenesTrabajo
          filas={filas}
          hrefOt={(ot) => `/calidad/ot/${encodeURIComponent(ot)}`}
          hrefPedido={(id) => `/calidad/pedidos/${id}`}
          hoy={hoy}
          columnaEstado={{
            titulo: "Evaluación",
            celda: (fila) => (
              <div className="flex flex-col items-start gap-1">
                <EstadoCalidad cancelado={false} avance={sinResumen ? undefined : avanceDe(fila)} />
                {!sinResumen && reinspeccionDe(fila) > 0 && (
                  <span className="text-[11px] font-medium text-rose-700">
                    {reinspeccionDe(fila)} por reinspeccionar
                  </span>
                )}
              </div>
            ),
          }}
        />
      )}
    </main>
  );
}
