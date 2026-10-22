import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeAdministrarPlaneacion, puedeEditarPlaneacion } from "@/lib/auth/get-perfil";
import AccionesPedido from "./acciones-pedido";
import ListaPedidos from "./lista-pedidos";
import IconoMenu from "@/components/iconos-menu";
import { FiltrosOrdenesTrabajo } from "@/components/lista-ordenes-trabajo";
import {
  agruparPorOrdenTrabajo,
  filtrarOrdenesTrabajo,
  hrefListaPedidos,
  type PedidoConOt,
} from "@/lib/planeacion/lista-ordenes-trabajo";
import Bienvenida from "@/components/bienvenida";
import { ResumenEnMenu } from "@/components/resumen-menu";
import QueSigue, { type PasoQueSigue } from "@/components/que-sigue";
import EstadoVacio from "@/components/estado-vacio";
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
  searchParams: Promise<{ q?: string; anio?: string; cliente?: string; f?: string }>;
}) {
  const { q, anio, cliente, f } = await searchParams;
  const filtroEstado = f === "revision" || f === "por-liberar" ? f : null;
  const busqueda = q?.trim() ?? "";
  const anioFiltro = anio && /^\d{4}$/.test(anio) ? Number(anio) : null;
  const clienteFiltro = cliente?.trim().toUpperCase() ?? "";
  // Filtros activos como texto, para los enlaces que conservan los demás.
  const anioParam = anioFiltro ? String(anioFiltro) : undefined;
  const clienteParam = clienteFiltro || undefined;
  const supabase = await createClient();
  // Perfil, cookie del filtro, búsqueda de muebles (solo con texto en el buscador:
  // se buscan también muebles y modelos en todos los pedidos, no solo O.T., PM,
  // proyecto o cliente) y lista de pedidos no dependen entre sí: se piden a la vez.
  const [perfil, cookieStore, busquedaMuebles, { data: pedidos, error }] = await Promise.all([
    getPerfilActual(supabase),
    cookies(),
    busqueda ? buscarMuebles(supabase, busqueda) : Promise.resolve(null),
    supabase
      .from("pedidos")
      .select(COLUMNAS)
      .is("eliminado_en", null)
      // Eliminado definitivo con folios de Calidad: solo vive en Cancelados.
      .is("eliminado_definitivo_en", null)
      .order("created_at", { ascending: false })
      .returns<PedidoRow[]>(),
  ]);
  const esAdmin = puedeAdministrarPlaneacion(perfil);
  const puedeCargar = puedeEditarPlaneacion(perfil);
  const filtroGuardado = leerFiltroGuardado(cookieStore.get(COOKIE_FILTRO_PEDIDOS)?.value);
  const filtroActual: FiltroGuardado = { anio: anioParam, cliente: clienteParam };

  // El avance de cada PM es un resumen: si falla la consulta, la lista sigue sin la columna llena.
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
  const avanceDe = (fila: (typeof filtradas.filas)[number]) =>
    sumarAvancePlan(avance, fila.pedidos.map((p) => p.id));
  const filas = filtradas.filas.filter((fila) => {
    if (!filtroEstado) return true;
    const a = avanceDe(fila);
    return filtroEstado === "revision" ? a.enRevision > 0 : a.vigentes > a.liberados;
  });

  // Qué sigue: lo que Planeación tiene que resolver (ítems en revisión) y lo que todavía no llega a
  // Producción. Cada paso abre la lista ya filtrada. Cargar Excel está siempre arriba a la derecha.
  const sumaTodas = sumarAvancePlan(avance, [...avance.keys()]);
  const otsEnRevision = filtradas.filas.filter((fila) => avanceDe(fila).enRevision > 0).length;
  const otsSinLiberar = filtradas.filas.filter((fila) => {
    const a = avanceDe(fila);
    return a.vigentes > a.liberados;
  }).length;
  const pasos: PasoQueSigue[] = [
    {
      valor: sumaTodas.enRevision,
      accion: "Resolver ítems en revisión",
      detalle: `ítems en revisión, en ${otsEnRevision} O.T.`,
      href: "/planeacion?f=revision",
      urgente: true,
    },
    {
      valor: sumaTodas.vigentes - sumaTodas.liberados,
      accion: "Ver lo que falta liberar",
      detalle: `ítems aún sin liberar a Producción, en ${otsSinLiberar} O.T.`,
      href: "/planeacion?f=por-liberar",
    },
  ];

  // Números de las tarjetas: sobre todas las O.T. vigentes, sin filtros.
  const todas = agruparPorOrdenTrabajo(pedidos ?? []);
  const hayMuebles = (busquedaMuebles?.grupos.length ?? 0) > 0;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida />
      {pedidos && pedidos.length > 0 && (
        <ResumenEnMenu
          tarjetas={[
            { valor: todas.length, etiqueta: "Órdenes de trabajo", detalle: `${pedidos.length} pedidos (PM) en total`, href: "/planeacion" },
          ]}
        />
      )}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pedidos</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Cada fila es una orden de trabajo (O.T.). Tócala para abrir su pedido.
          </p>
        </div>
        {puedeCargar && (
          <Link
            href="/planeacion/upload"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-on-brand shadow-sm transition hover:bg-brand-400"
          >
            <IconoMenu nombre="subir" className="h-4 w-4" />
            Cargar Excel
          </Link>
        )}
      </div>

      {!error && pedidos && pedidos.length > 0 && <QueSigue pasos={pasos} />}

      <form action="/planeacion" className="flex gap-2">
        {filtroEstado && <input type="hidden" name="f" value={filtroEstado} />}
        {anioFiltro && <input type="hidden" name="anio" value={anioFiltro} />}
        {clienteFiltro && <input type="hidden" name="cliente" value={clienteFiltro} />}
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

      <FiltrosOrdenesTrabajo
        base="/planeacion"
        anios={aniosDisponibles}
        anio={anioFiltro}
        clientes={clientesDisponibles}
        cliente={clienteFiltro}
        q={busqueda || undefined}
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

      {filtroEstado && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          {filtroEstado === "revision"
            ? "Mostrando solo las O.T. con ítems en revisión"
            : "Mostrando solo las O.T. con ítems sin liberar a Producción"}{" "}
          ({filas.length}).
          <Link href="/planeacion" className="font-medium underline-offset-2 hover:underline">
            Ver todas
          </Link>
        </p>
      )}

      {filas.length > 0 && (
        <ListaPedidos
          filas={filas.map((fila) => {
            const primero = fila.pedidos[0];
            return {
              clave: fila.ot ?? primero.id,
              titulo: fila.ot ?? primero.numero_pedido,
              esOt: !!fila.ot,
              // Una O.T. con un solo PM abre directo el pedido; con varios, la O.T. para elegir.
              href:
                fila.ot && fila.pedidos.length > 1
                  ? `/planeacion/ot/${encodeURIComponent(fila.ot)}`
                  : `/planeacion/pedidos/${primero.id}`,
              proyecto: primero.proyectos?.nombre ?? "—",
              cliente: primero.proyectos?.cliente ?? null,
              pedidos: fila.pedidos.length,
              avance: <AvanceOt avance={sumarAvancePlan(avance, fila.pedidos.map((p) => p.id))} />,
              // Los PM sueltos (sin O.T.) se envían a la papelera desde la lista; los de una O.T., desde su página.
              accion:
                esAdmin && !fila.ot ? (
                  <AccionesPedido pedidoId={primero.id} numeroPedido={primero.numero_pedido} eliminado={false} />
                ) : undefined,
            };
          })}
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

    </main>
  );
}
