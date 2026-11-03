import { createClient } from "@/lib/supabase/server";
import { buscarMuebles } from "@/lib/produccion/buscar-muebles";
import { FiltrosOrdenesTrabajo } from "@/components/lista-ordenes-trabajo";
import EstadoVacio from "@/components/estado-vacio";
import {
  clienteDe,
  filtrarOrdenesTrabajo,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import ResultadosMuebles from "../resultados-muebles";
import { avancePorPedido, estadoLiberacion, sumarAvanceDe } from "@/lib/resumen/avance-items";
import { traerTodo } from "@/lib/supabase/traer-todo";
import { DesplegableCliente, SelectorEstado } from "@/components/controles-lista";
import {
  agruparPorCliente,
  filtrarPorEstado,
  leerEstadoLista,
  paramEstadoLista,
} from "@/lib/planeacion/vista-lista";
import ListaOrdenes from "../lista-ordenes";
import BuscadorOt from "../buscador-ot";

// Igual que en Planeación: órdenes de trabajo con sus PM. Al entrar a una O.T.
// se ven sus PM; el buscador además encuentra muebles y modelos en todos los
// pedidos.
export default async function ProduccionListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; anio?: string; estado?: string }>;
}) {
  const { q, anio, estado: estadoParam } = await searchParams;
  const consulta = (q ?? "").trim();
  const estado = leerEstadoLista(estadoParam, !!consulta);
  const anioFiltro = anio && /^\d{4}$/.test(anio) ? Number(anio) : null;
  const supabase = await createClient();

  // Búsqueda de muebles (con texto en el buscador se muestran también muebles/modelos
  // de todos los pedidos), pedidos y avance de liberación por pedido no dependen entre sí:
  // se piden a la vez.
  const [busqueda, { data: pedidos, error }, avance, enTaller] = await Promise.all([
    consulta ? buscarMuebles(supabase, consulta) : Promise.resolve(null),
    supabase
      .from("pedidos")
      .select("id, numero_pedido, orden_trabajo, fecha_pedido, fecha_entrega, created_at, proyectos ( nombre, cliente )")
      .is("eliminado_en", null)
      // Eliminado definitivo con folios de Calidad: solo vive en Cancelados.
      .is("eliminado_definitivo_en", null)
      .order("created_at", { ascending: false })
      .returns<PedidoConOt[]>(),
    avancePorPedido(supabase, { conCalidad: false }),
    // Pedidos con asignaciones todavía en el taller: siguen activos aunque ya se hayan liberado todos.
    traerTodo<{ pedido_id: string }>((desde, hasta) =>
      supabase
        .from("asignaciones_produccion_resumen")
        .select("pedido_id")
        .in("estado", ["en_proceso", "parcial"])
        .order("pedido_id")
        .range(desde, hasta)
        .returns<{ pedido_id: string }[]>()
    ),
  ]);
  const pedidosEnTaller = new Set(enTaller.data.map((a) => a.pedido_id));

  const filtradas = filtrarOrdenesTrabajo(pedidos ?? [], {
    anio: anioFiltro,
    cliente: "",
    busqueda: consulta,
  });
  const { aniosDisponibles } = filtradas;

  const avanceDe = (fila: (typeof filtradas.filas)[number]) =>
    sumarAvanceDe(avance, fila.pedidos.map((p) => p.id));
  // Terminada = todo liberado y nada en el taller. Si no se pudo leer el taller, no se esconde nada.
  const terminada = (fila: (typeof filtradas.filas)[number]) =>
    !enTaller.error &&
    estadoLiberacion(avanceDe(fila)) === "liberado" &&
    !fila.pedidos.some((p) => pedidosEnTaller.has(p.id));
  const cuentas = {
    activos: filtrarPorEstado(filtradas.filas, "activos", terminada).length,
    terminados: filtrarPorEstado(filtradas.filas, "terminados", terminada).length,
    todos: filtradas.filas.length,
  };
  const filasEstado = filtrarPorEstado(filtradas.filas, estado, terminada);
  const filas = filasEstado;
  const hayFiltros = !!(consulta || anioFiltro);
  const estadoLink = paramEstadoLista(estado, !!consulta);
  const paramsLista = {
    q: consulta || undefined,
    anio: anioFiltro ? String(anioFiltro) : undefined,
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pedidos</h1>
      </div>

      <BuscadorOt
        opciones={(pedidos ?? []).map((p) => ({
          ot: p.orden_trabajo,
          pm: p.numero_pedido,
          pedidoId: p.id,
          cliente: p.proyectos?.cliente ?? "—",
          proyecto: p.proyectos?.nombre ?? "—",
        }))}
        consulta={consulta}
        anio={anioFiltro}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <SelectorEstado
          base="/produccion/pedidos"
          actual={estado}
          cuentas={cuentas}
          params={paramsLista}
          hayBusqueda={!!consulta}
        />
        {aniosDisponibles.length > 0 && (
          <details open={!!anioFiltro} className="group">
            <summary className="cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900">
              Filtrar por año
              {anioFiltro ? " (activo)" : ""}
            </summary>
            <div className="mt-3">
              <FiltrosOrdenesTrabajo
                base="/produccion/pedidos"
                anios={aniosDisponibles}
                anio={anioFiltro}
                q={consulta || undefined}
                estado={estadoLink}
              />
            </div>
          </details>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar los pedidos: {error.message}
        </p>
      )}

      {!error && (!pedidos || pedidos.length === 0) && (
        <EstadoVacio
          titulo="Todavía no hay pedidos"
          descripcion="Aparecerán aquí cuando Planeación suba su Excel."
        />
      )}

      {pedidos && pedidos.length > 0 && (
        <section className="flex flex-col gap-3">
          {consulta && (
            <h2 className="text-sm font-semibold text-slate-600">
              Órdenes de trabajo que coinciden con &ldquo;{consulta}&rdquo;
            </h2>
          )}
          {filas.length === 0 ? (
            <EstadoVacio
              titulo={
                hayFiltros
                  ? "Ninguna O.T. coincide"
                  : estado === "activos"
                    ? "No hay O.T. activas"
                    : estado === "terminados"
                      ? "No hay O.T. terminadas"
                      : "No hay pedidos"
              }
              descripcion={hayFiltros ? "Prueba con otra búsqueda o quita los filtros." : undefined}
              accion={hayFiltros ? { href: "/produccion/pedidos", etiqueta: "Quitar filtros" } : undefined}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {agruparPorCliente(filas, (fila) => clienteDe(fila.pedidos[0])).map((grupo, _, grupos) => (
                <DesplegableCliente
                  key={grupo.cliente}
                  cliente={grupo.cliente}
                  total={grupo.filas.length}
                  // Abiertos al buscar o si es uno solo: no se esconde lo que se acaba de pedir.
                  abierto={!!consulta || grupos.length === 1}
                >
                  <ListaOrdenes filas={grupo.filas} avanceDe={avanceDe} />
                </DesplegableCliente>
              ))}
            </div>
          )}
        </section>
      )}

      {busqueda && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-600">Muebles y modelos</h2>
          <p className="text-sm text-slate-600">
            {busqueda.totalGrupos === 0
              ? `Ningún mueble ni modelo coincide con "${consulta}". Revisa la ortografía o busca por modelo o folio.`
              : `${busqueda.totalGrupos} mueble${busqueda.totalGrupos === 1 ? "" : "s"} encontrado${
                  busqueda.totalGrupos === 1 ? "" : "s"
                } para "${consulta}"${
                  busqueda.truncado ? " (primeros 40: afina la búsqueda)" : ""
                }. Haz clic en uno para ver sus componentes.`}
          </p>
          {busqueda.grupos.length > 0 && <ResultadosMuebles grupos={busqueda.grupos} />}
        </section>
      )}
    </main>
  );
}
