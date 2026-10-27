import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FiltrosOrdenesTrabajo } from "@/components/lista-ordenes-trabajo";
import { DesplegableCliente, SelectorEstado } from "@/components/controles-lista";
import {
  agruparPorCliente,
  filtrarPorEstado,
  leerEstadoLista,
  paramEstadoLista,
} from "@/lib/planeacion/vista-lista";
import {
  clienteDe,
  filtrarOrdenesTrabajo,
  hrefListaPedidos,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import Bienvenida from "@/components/bienvenida";
import { cargarResumenCalidad, type ResumenCalidadConTaller } from "@/lib/calidad/resumen-db";
import { estadoCalidad, type AvancePedido } from "@/lib/resumen/avance-items";
import { paginarTodo } from "@/lib/supabase/paginar";
import EstadoCalidad from "./estado-calidad";
import ListaPedidos from "@/app/planeacion/lista-pedidos";

// Igual que en Planeación y Producción: órdenes de trabajo con sus PM. Al
// entrar a una O.T. se ven sus PM con el avance de evaluación.
export default async function CalidadListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; anio?: string; estado?: string; f?: string }>;
}) {
  const { q, anio, estado: estadoParam, f } = await searchParams;
  const filtroEstado = f === "por-evaluar" || f === "reinspeccion" ? f : null;
  const busqueda = q?.trim() ?? "";
  const anioFiltro = anio && /^\d{4}$/.test(anio) ? Number(anio) : null;
  const estado = leerEstadoLista(estadoParam, !!busqueda);
  const estadoLink = paramEstadoLista(estado, !!busqueda);
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
    cliente: "",
    busqueda,
  });
  const { aniosDisponibles } = filtradas;

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
  // Con el filtro del panel (por evaluar / reinspección) se muestran esas O.T. sin importar su estado.
  const filasFiltro = filtradas.filas.filter(
    (fila) =>
      !filtroEstado ||
      (filtroEstado === "por-evaluar" ? avanceDe(fila).porEvaluar > 0 : reinspeccionDe(fila) > 0)
  );
  // Terminada = todo evaluado, nada por reinspeccionar y nada en taller. Sin resumen no se esconde nada.
  const terminada = (fila: (typeof filtradas.filas)[number]) =>
    !sinResumen &&
    estadoCalidad(avanceDe(fila)) === "evaluado" &&
    reinspeccionDe(fila) === 0 &&
    enTallerDe(fila) === 0;
  const cuentas = {
    activos: filtrarPorEstado(filasFiltro, "activos", terminada).length,
    terminados: filtrarPorEstado(filasFiltro, "terminados", terminada).length,
    todos: filasFiltro.length,
  };
  const filas = filtroEstado ? filasFiltro : filtrarPorEstado(filasFiltro, estado, terminada);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida />
      {sinResumen && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No se pudieron calcular los números del panel. Recarga la página para reintentar; la lista de
          abajo sí está completa.
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Pedidos — Calidad
          </h1>
        </div>
      </div>

      <form action="/calidad" className="flex gap-2">
        {anioFiltro && <input type="hidden" name="anio" value={anioFiltro} />}
        {estadoLink && <input type="hidden" name="estado" value={estadoLink} />}
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
              estado: estadoLink,
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
        q={busqueda || undefined}
        estado={estadoLink}
      />

      {pedidosParaCalidad.length > 0 && !filtroEstado && (
        <SelectorEstado
          base="/calidad"
          actual={estado}
          cuentas={cuentas}
          params={{ q: busqueda || undefined, anio: anioFiltro ? String(anioFiltro) : undefined }}
          hayBusqueda={!!busqueda}
        />
      )}

      {pedidos.length > 0 && pedidosParaCalidad.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no hay muebles enviados a producción. Cuando los haya, aparecerán aquí.
        </p>
      )}

      {pedidosParaCalidad.length > 0 && filas.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          {estado === "activos" && !busqueda && !filtroEstado && !anioFiltro
            ? "No hay O.T. activas."
            : estado === "terminados" && !busqueda && !filtroEstado && !anioFiltro
              ? "No hay O.T. terminadas."
              : "Ninguna O.T. coincide con los filtros."}
        </p>
      )}

      {filas.length > 0 && (
        <div className="flex flex-col gap-3">
          {agruparPorCliente(filas, (fila) => clienteDe(fila.pedidos[0])).map((grupo, _, grupos) => (
            <DesplegableCliente
              key={grupo.cliente}
              cliente={grupo.cliente}
              total={grupo.filas.length}
              // Abiertos al buscar, al venir de un filtro del panel o si es uno solo.
              abierto={!!busqueda || !!filtroEstado || grupos.length === 1}
            >
              <ListaPedidos
                tituloAvance="Evaluación"
                filas={grupo.filas.map((fila) => {
                  const primero = fila.pedidos[0];
                  return {
                    clave: fila.ot ?? primero.id,
                    titulo: fila.ot ?? primero.numero_pedido,
                    esOt: !!fila.ot,
                    href: fila.ot ? `/calidad/ot/${encodeURIComponent(fila.ot)}` : `/calidad/pedidos/${primero.id}`,
                    proyecto: primero.proyectos?.nombre ?? "—",
                    // El cliente ya es el encabezado del desplegable.
                    cliente: null,
                    pedidos: fila.pedidos.length,
                    avance: (
                      <div className="flex flex-col items-start gap-1">
                        <EstadoCalidad
                          cancelado={false}
                          avance={sinResumen ? undefined : avanceDe(fila)}
                          enTaller={sinResumen ? 0 : enTallerDe(fila)}
                        />
                        {!sinResumen && reinspeccionDe(fila) > 0 && (
                          <span className="text-xs font-medium text-rose-700">
                            {reinspeccionDe(fila)} por reinspeccionar
                          </span>
                        )}
                        {/* Con barra de avance; si todo está en taller, ya lo dice la etiqueta. */}
                        {!sinResumen && enTallerDe(fila) > 0 && avanceDe(fila).liberados > 0 && (
                          <span className="text-xs text-slate-500">{enTallerDe(fila)} en taller</span>
                        )}
                      </div>
                    ),
                  };
                })}
              />
            </DesplegableCliente>
          ))}
        </div>
      )}
    </main>
  );
}
