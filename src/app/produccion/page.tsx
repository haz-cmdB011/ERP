import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarMuebles } from "@/lib/produccion/buscar-muebles";
import { FiltrosOrdenesTrabajo, TablaOrdenesTrabajo } from "@/components/lista-ordenes-trabajo";
import {
  filtrarOrdenesTrabajo,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import ResultadosMuebles from "./resultados-muebles";
import Bienvenida from "@/components/bienvenida";
import { type TarjetaResumen } from "@/components/resumen-inicio";
import { ResumenEnMenu } from "@/components/resumen-menu";
import { avancePorPedido, sumarAvance, sumarAvanceDe } from "@/lib/resumen/avance-items";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import { cargarDetenidos } from "@/lib/produccion/detenidos-db";
import {
  DIAS_SIN_REASIGNAR,
  DIAS_SIN_VERIFICAR,
  avisoDetenidos,
} from "@/lib/produccion/detenidos";
import EstadoLiberacion from "./estado-liberacion";
import BuscadorOt from "./buscador-ot";

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
  // de todos los pedidos), pedidos, avance de liberación por pedido (las tarjetas suman
  // todo lo vigente) y lo detenido no dependen entre sí: se piden a la vez.
  const hoy = hoyMexico();
  const [busqueda, { data: pedidos, error }, avance, detenidos] = await Promise.all([
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
    // Resumen: si falla, la pantalla sigue sin esas tarjetas.
    cargarDetenidos(supabase, hoy).catch(() => null),
  ]);

  const filtradas = filtrarOrdenesTrabajo(pedidos ?? [], {
    anio: anioFiltro,
    cliente: clienteFiltro,
    busqueda: consulta,
  });
  const { aniosDisponibles, clientesDisponibles } = filtradas;

  const total = sumarAvance(avance);
  const avanceDe = (fila: (typeof filtradas.filas)[number]) =>
    sumarAvanceDe(avance, fila.pedidos.map((p) => p.id));
  const otsConPendientes = filtradas.filas.filter((fila) => avanceDe(fila).porLiberar > 0).length;
  const filas = filtradas.filas.filter((fila) => !soloPorLiberar || avanceDe(fila).porLiberar > 0);
  const hayFiltros = !!(consulta || anioFiltro || clienteFiltro);

  const tarjetas: TarjetaResumen[] = [
    {
      valor: total.porLiberar,
      etiqueta: "Ítems por liberar",
      detalle: `en ${otsConPendientes} O.T.`,
      href: "/produccion?f=por-liberar",
      tono: "atencion",
    },
    {
      valor: new Set((pedidos ?? []).map((p) => p.orden_trabajo ?? p.id)).size,
      etiqueta: "O.T. vigentes",
      href: "/produccion",
    },
  ];
  if (detenidos) {
    tarjetas.push(
      {
        valor: detenidos.sinVerificar.total,
        etiqueta: "Entregas por verificar",
        detalle: "revisa lo que entregaron los equipos",
        href: "/produccion/asignaciones?estado=por_verificar",
        tono: "atencion",
        alerta: avisoDetenidos(detenidos.sinVerificar, DIAS_SIN_VERIFICAR),
      },
      {
        valor: detenidos.sinReasignar.total,
        etiqueta: "Rechazos por reasignar",
        detalle: "piezas que Calidad no aprobó",
        href: "/produccion/rechazos",
        tono: "atencion",
        alerta: avisoDetenidos(detenidos.sinReasignar, DIAS_SIN_REASIGNAR),
      }
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida />
      <ResumenEnMenu tarjetas={tarjetas} />
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Pedidos — Producción
          </h1>
        </div>
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

      <FiltrosOrdenesTrabajo
        base="/produccion"
        anios={aniosDisponibles}
        anio={anioFiltro}
        clientes={clientesDisponibles}
        cliente={clienteFiltro}
        q={consulta || undefined}
      />

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar los pedidos: {error.message}
        </p>
      )}

      {!error && (!pedidos || pedidos.length === 0) && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no hay pedidos. Aparecerán aquí cuando Planeación suba su Excel.
        </p>
      )}

      {soloPorLiberar && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          Mostrando solo las O.T. con ítems por liberar ({filas.length}).
          <Link href="/produccion" className="font-medium underline-offset-2 hover:underline">
            Ver todas
          </Link>
        </p>
      )}

      {pedidos && pedidos.length > 0 && (
        <section className="flex flex-col gap-3">
          {consulta && (
            <h2 className="text-sm font-semibold text-slate-600">
              Órdenes de trabajo que coinciden con &ldquo;{consulta}&rdquo;
            </h2>
          )}
          {filas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              <p>
                {soloPorLiberar
                  ? "No hay ítems por liberar. Todo está al día."
                  : hayFiltros
                    ? "Ninguna O.T. coincide con los filtros."
                    : "No hay pedidos."}
              </p>
              {(soloPorLiberar || hayFiltros) && (
                <Link href="/produccion" className="font-medium text-brand-700 hover:underline">
                  {soloPorLiberar ? "Ver todas las O.T. →" : "Quitar filtros →"}
                </Link>
              )}
            </div>
          ) : (
            <TablaOrdenesTrabajo
              filas={filas}
              hrefOt={(ot) => `/produccion/ot/${encodeURIComponent(ot)}`}
              hrefPedido={(id) => `/produccion/pedidos/${id}`}
              columnaEstado={{
                titulo: "Liberación",
                celda: (fila) => <EstadoLiberacion cancelado={false} avance={avanceDe(fila)} />,
              }}
            />
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
