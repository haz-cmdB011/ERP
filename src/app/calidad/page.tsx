import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FiltrosOrdenesTrabajo } from "@/components/lista-ordenes-trabajo";
import {
  filtrarOrdenesTrabajo,
  hrefListaPedidos,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import Bienvenida from "@/components/bienvenida";
import { cargarResumenCalidad, type ResumenCalidadConTaller } from "@/lib/calidad/resumen-db";
import type { AvancePedido } from "@/lib/resumen/avance-items";
import { paginarTodo } from "@/lib/supabase/paginar";
import EstadoCalidad from "./estado-calidad";
import ListaPedidos from "@/app/planeacion/lista-pedidos";

function hrefLista(o: { q?: string; anio?: number | null; cliente?: string; f?: string }): string {
  return hrefListaPedidos("/calidad", {
    q: o.q || undefined,
    anio: o.anio ? String(o.anio) : undefined,
    cliente: o.cliente || undefined,
  }) + (o.f ? `${o.q || o.anio || o.cliente ? "&" : "?"}f=${o.f}` : "");
}

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
  // Ya no hay tarjeta ni alerta de "lotes por evaluar": revisar cada entrega es
  // opcional (Calidad revisa el mueble completo en la revisión final).
  const [pedidos, resumen] = await Promise.all([
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
    cargarResumenCalidad(supabase).catch((): ResumenCalidadConTaller | null => null),
  ]);

  const sinResumen = resumen === null;
  // Calidad ve todos los pedidos con muebles enviados a producción: los que ya
  // tienen algo preaprobado (o historial de informes) y los que siguen en taller,
  // donde también puede encontrar fallas. Si el resumen no se pudo calcular se
  // muestran todos y arriba se avisa.
  const pedidosParaCalidad = sinResumen
    ? pedidos
    : pedidos.filter((p) => resumen.porPedido.has(p.id) || resumen.enTallerPorPedido.has(p.id));
  const filtradas = filtrarOrdenesTrabajo(pedidosParaCalidad, {
    anio: anioFiltro,
    cliente: clienteFiltro,
    busqueda,
  });
  const { aniosDisponibles, clientesDisponibles } = filtradas;

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
  // Ítems que Calidad ve pero siguen en taller (no cuentan como pendientes).
  const enTallerDe = (fila: (typeof filtradas.filas)[number]) =>
    pedidoIdsDe(fila).reduce((n, id) => n + (resumen?.enTallerPorPedido.get(id) ?? 0), 0);
  const otsConPendientes = filtradas.filas.filter((fila) => avanceDe(fila).porEvaluar > 0).length;
  const otsConReinspeccion = filtradas.filas.filter((fila) => reinspeccionDe(fila) > 0).length;
  const filas = filtradas.filas.filter(
    (fila) =>
      !filtroEstado ||
      (filtroEstado === "por-evaluar" ? avanceDe(fila).porEvaluar > 0 : reinspeccionDe(fila) > 0)
  );

  const hayFiltros = !!(busqueda || anioFiltro || clienteFiltro);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida />
      {sinResumen && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No se pudieron calcular los números del panel. Recarga la página para reintentar; la lista de
          abajo sí está completa.
        </p>
      )}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pedidos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada O.T. es la orden de trabajo de un proyecto. Tócala para ver sus muebles y evaluarlos.
        </p>
      </div>

      <form action="/calidad" className="flex gap-2">
        {anioFiltro && <input type="hidden" name="anio" value={anioFiltro} />}
        {clienteFiltro && <input type="hidden" name="cliente" value={clienteFiltro} />}
        {filtroEstado && <input type="hidden" name="f" value={filtroEstado} />}
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
            href={hrefLista({ anio: anioFiltro, cliente: clienteFiltro, f: filtroEstado ?? undefined })}
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

      {pedidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {!sinResumen && (
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(
                [
                  [null, "Todas"],
                  ["por-evaluar", `Por evaluar (${otsConPendientes})`],
                  ["reinspeccion", `Por reinspeccionar (${otsConReinspeccion})`],
                ] as [string | null, string][]
              ).map(([valor, etiqueta]) => (
                <Link
                  key={etiqueta}
                  href={hrefLista({ q: busqueda, anio: anioFiltro, cliente: clienteFiltro, f: valor ?? undefined })}
                  className={`rounded-md px-3 py-1.5 font-medium transition-colors pointer-coarse:py-2.5 ${
                    filtroEstado === valor ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {etiqueta}
                </Link>
              ))}
            </div>
          )}
          {aniosDisponibles.length > 0 && (
            <details open={!!(anioFiltro || clienteFiltro)} className="group">
              <summary className="cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900">
                Filtrar por año o cliente
                {anioFiltro || clienteFiltro ? " (activo)" : ""}
              </summary>
              <div className="mt-3">
                <FiltrosOrdenesTrabajo
                  base="/calidad"
                  anios={aniosDisponibles}
                  anio={anioFiltro}
                  clientes={clientesDisponibles}
                  cliente={clienteFiltro}
                  q={busqueda || undefined}
                />
              </div>
            </details>
          )}
        </div>
      )}

      {pedidos.length > 0 && pedidosParaCalidad.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no hay muebles enviados a producción. Cuando los haya, aparecerán aquí.
        </p>
      )}

      {pedidosParaCalidad.length > 0 && filas.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          <p>
            {filtroEstado === "por-evaluar"
              ? "No hay muebles por evaluar. Todo está al día."
              : filtroEstado === "reinspeccion"
                ? "No hay muebles por reinspeccionar."
                : "Ninguna O.T. coincide con los filtros."}
          </p>
          {(filtroEstado || hayFiltros) && (
            <Link href="/calidad" className="font-medium text-brand-700 hover:underline">
              {filtroEstado ? "Ver todas las O.T. →" : "Quitar filtros →"}
            </Link>
          )}
        </div>
      )}

      {filas.length > 0 && (
        <ListaPedidos
          tituloAvance="Evaluación"
          filas={filas.map((fila) => {
            const primero = fila.pedidos[0];
            return {
              clave: fila.ot ?? primero.id,
              titulo: fila.ot ?? primero.numero_pedido,
              esOt: !!fila.ot,
              // Una O.T. con un solo PM abre directo el pedido; con varios, la O.T. para elegir.
              href:
                fila.ot && fila.pedidos.length > 1
                  ? `/calidad/ot/${encodeURIComponent(fila.ot)}`
                  : `/calidad/pedidos/${primero.id}`,
              proyecto: primero.proyectos?.nombre ?? "—",
              cliente: primero.proyectos?.cliente ?? null,
              pedidos: fila.pedidos.length,
              avance: (
                <div className="flex flex-col items-start gap-1">
                  <EstadoCalidad
                    cancelado={false}
                    avance={sinResumen ? undefined : avanceDe(fila)}
                    enTaller={sinResumen ? 0 : enTallerDe(fila)}
                  />
                  {!sinResumen && reinspeccionDe(fila) > 0 && (
                    <span className="text-[11px] font-medium text-rose-700">
                      {reinspeccionDe(fila)} por reinspeccionar
                    </span>
                  )}
                  {/* Con barra de avance; si todo está en taller, ya lo dice la etiqueta. */}
                  {!sinResumen && enTallerDe(fila) > 0 && avanceDe(fila).liberados > 0 && (
                    <span className="text-[11px] text-slate-500">{enTallerDe(fila)} en taller</span>
                  )}
                </div>
              ),
            };
          })}
        />
      )}
    </main>
  );
}
