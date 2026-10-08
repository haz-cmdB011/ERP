import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarMuebles } from "@/lib/produccion/buscar-muebles";
import { FiltrosOrdenesTrabajo, TablaOrdenesTrabajo } from "@/components/lista-ordenes-trabajo";
import {
  filtrarOrdenesTrabajo,
  ultimaEntrega,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import ResultadosMuebles from "./resultados-muebles";
import Bienvenida from "@/components/bienvenida";
import ResumenInicio, { type TarjetaResumen } from "@/components/resumen-inicio";
import ChipEntrega from "@/components/chip-entrega";
import { avancePorPedido, sumarAvance, sumarAvanceDe } from "@/lib/resumen/avance-items";
import { estadoEntrega } from "@/lib/resumen/entrega";
import { hoyMexico } from "@/lib/produccion/asignaciones";
import { esAlerta, otConPendientes, plazoDePedido, resumirTaller } from "@/lib/produccion/atrasos";
import { cargarTaller } from "@/lib/produccion/cargar-taller";
import { cargarDetenidos } from "@/lib/produccion/detenidos-db";
import {
  DIAS_SIN_EVALUAR_LOTE,
  DIAS_SIN_REASIGNAR,
  DIAS_SIN_VERIFICAR,
  avisoDetenidos,
} from "@/lib/produccion/detenidos";
import EstadoLiberacion from "./estado-liberacion";
import BuscadorOt from "./buscador-ot";
import ChipPlazo from "./chip-plazo";

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
  // todo lo vigente) y tablero del taller no dependen entre sí: se piden a la vez. El
  // taller es un resumen: si falla la consulta la pantalla sigue, solo sin esa tarjeta
  // ni alertas de asignaciones.
  const hoy = hoyMexico();
  const [busqueda, { data: pedidos, error }, avance, taller, detenidos] = await Promise.all([
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
    cargarTaller(supabase, hoy).catch(() => null),
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
  const totalOts = filas.filter((f) => f.ot).length;
  const hayFiltros = !!(consulta || anioFiltro || clienteFiltro);

  // Lo que sigue en el taller y qué va atrasado.
  const resumenTaller = taller ? resumirTaller(taller.asignaciones, taller.plazos, hoy) : null;
  const enTallerPorPedido = new Map<string, number>();
  for (const a of taller?.asignaciones ?? []) {
    if (a.pedido_id) enTallerPorPedido.set(a.pedido_id, (enTallerPorPedido.get(a.pedido_id) ?? 0) + 1);
  }

  const tarjetas: TarjetaResumen[] = [
    {
      valor: total.porLiberar,
      etiqueta: "Ítems por liberar",
      detalle: `en ${otsConPendientes} O.T.`,
      href: "/produccion?f=por-liberar",
      tono: "atencion",
    },
    { valor: total.liberados, etiqueta: "Ítems liberados", detalle: "ya enviados a producción" },
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
      },
      {
        valor: detenidos.sinEvaluar.total,
        etiqueta: "Lotes esperando a Calidad",
        detalle: "ya verificados, sin evaluar",
        tono: "suave",
        alerta: avisoDetenidos(detenidos.sinEvaluar, DIAS_SIN_EVALUAR_LOTE),
      }
    );
  }
  if (resumenTaller) {
    tarjetas.push({
      valor: resumenTaller.atrasadas.length,
      etiqueta: "Asignaciones atrasadas",
      detalle: `de ${resumenTaller.total} en taller`,
      href: "/produccion/tablero#atrasadas",
      tono: "atencion",
    });
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida
        acciones={[
          { href: "/produccion/escanear", etiqueta: "Escanear QR" },
          { href: "/produccion/tablero", etiqueta: "Tablero del taller" },
          { href: "/produccion/folios", etiqueta: "Folios de producción" },
        ]}
      />
      <ResumenInicio tarjetas={tarjetas} />
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Pedidos — Producción
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Entra a una O.T. para liberar ítems, generar viajeros y asignar a equipos.
          </p>
        </div>
        {pedidos && pedidos.length > 0 && (
          <span className="whitespace-nowrap rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {totalOts} O.T.
          </span>
        )}
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
              chipEntrega={(fila) => {
                // Vencida o por vencer solo alerta si aún queda trabajo: sin
                // él, se queda como la etiqueta normal por fecha.
                const fecha = ultimaEntrega(fila.pedidos);
                const plazo = plazoDePedido(fecha, hoy);
                const enTaller = fila.pedidos.reduce((s, p) => s + (enTallerPorPedido.get(p.id) ?? 0), 0);
                if (esAlerta(plazo) && otConPendientes(avanceDe(fila).porLiberar, enTaller)) {
                  return <ChipPlazo plazo={plazo} fecha={fecha} />;
                }
                return <ChipEntrega estado={estadoEntrega(fecha, hoy)} />;
              }}
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
