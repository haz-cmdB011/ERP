import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarMuebles } from "@/lib/produccion/buscar-muebles";
import { FiltrosOrdenesTrabajo } from "@/components/lista-ordenes-trabajo";
import EstadoVacio from "@/components/estado-vacio";
import {
  filtrarOrdenesTrabajo,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import ResultadosMuebles from "./resultados-muebles";
import Bienvenida from "@/components/bienvenida";
import { avancePorPedido, sumarAvanceDe } from "@/lib/resumen/avance-items";
import ListaOrdenes from "./lista-ordenes";
import BuscadorOt from "./buscador-ot";

function hrefLista(o: { q?: string; anio?: number | null; cliente?: string; porLiberar?: boolean }): string {
  const params = new URLSearchParams();
  if (o.q) params.set("q", o.q);
  if (o.anio) params.set("anio", String(o.anio));
  if (o.cliente) params.set("cliente", o.cliente);
  if (o.porLiberar) params.set("f", "por-liberar");
  const texto = params.toString();
  return texto ? `/produccion?${texto}` : "/produccion";
}

// Igual que en Planeación: órdenes de trabajo con sus PM. Al entrar a una O.T.
// se ven sus PM; el buscador además encuentra muebles y modelos en todos los
// pedidos.
export default async function ProduccionListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; anio?: string; cliente?: string; f?: string }>;
}) {
  const { q, anio, cliente, f } = await searchParams;
  const soloPorLiberar = f === "por-liberar";
  const consulta = (q ?? "").trim();
  const anioFiltro = anio && /^\d{4}$/.test(anio) ? Number(anio) : null;
  const clienteFiltro = cliente?.trim().toUpperCase() ?? "";
  const supabase = await createClient();

  // Búsqueda de muebles (con texto en el buscador se muestran también muebles/modelos
  // de todos los pedidos), pedidos y avance de liberación por pedido no dependen entre sí:
  // se piden a la vez.
  const [busqueda, { data: pedidos, error }, avance] = await Promise.all([
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
  ]);

  const filtradas = filtrarOrdenesTrabajo(pedidos ?? [], {
    anio: anioFiltro,
    cliente: clienteFiltro,
    busqueda: consulta,
  });
  const { aniosDisponibles, clientesDisponibles } = filtradas;

  const avanceDe = (fila: (typeof filtradas.filas)[number]) =>
    sumarAvanceDe(avance, fila.pedidos.map((p) => p.id));
  const otsConPendientes = filtradas.filas.filter((fila) => avanceDe(fila).porLiberar > 0).length;
  const filas = filtradas.filas.filter((fila) => !soloPorLiberar || avanceDe(fila).porLiberar > 0);
  const hayFiltros = !!(consulta || anioFiltro || clienteFiltro);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida />
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pedidos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada O.T. es la orden de trabajo de un proyecto. Ábrela para liberar sus muebles a Producción y
          asignarlos a equipos.
        </p>
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
        cliente={clienteFiltro || undefined}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <Link
            href={hrefLista({ q: consulta, anio: anioFiltro, cliente: clienteFiltro })}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors pointer-coarse:py-2.5 ${
              !soloPorLiberar ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Todas
          </Link>
          <Link
            href={hrefLista({ q: consulta, anio: anioFiltro, cliente: clienteFiltro, porLiberar: true })}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors pointer-coarse:py-2.5 ${
              soloPorLiberar ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Con muebles por liberar ({otsConPendientes})
          </Link>
        </div>
        {aniosDisponibles.length > 0 && (
          <details open={!!(anioFiltro || clienteFiltro)} className="group">
            <summary className="cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900">
              Filtrar por año o cliente
              {anioFiltro || clienteFiltro ? " (activo)" : ""}
            </summary>
            <div className="mt-3">
              <FiltrosOrdenesTrabajo
                base="/produccion"
                anios={aniosDisponibles}
                anio={anioFiltro}
                clientes={clientesDisponibles}
                cliente={clienteFiltro}
                q={consulta || undefined}
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
                soloPorLiberar
                  ? "No hay muebles por liberar"
                  : hayFiltros
                    ? "Ninguna O.T. coincide"
                    : "No hay pedidos"
              }
              descripcion={soloPorLiberar ? "Todo está al día." : hayFiltros ? "Prueba con otra búsqueda o quita los filtros." : undefined}
              accion={
                soloPorLiberar || hayFiltros
                  ? { href: "/produccion", etiqueta: soloPorLiberar ? "Ver todas las O.T." : "Quitar filtros" }
                  : undefined
              }
            />
          ) : (
            <ListaOrdenes filas={filas} avanceDe={avanceDe} />
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
