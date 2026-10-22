import Link from "next/link";
import EnlaceFila from "@/components/enlace-fila";
import { createClient } from "@/lib/supabase/server";
import {
  getPerfilActual,
  puedeAdministrarProduccion,
  puedeEditarProduccion,
} from "@/lib/auth/get-perfil";
import Paginacion, { TAMANO_PAGINA } from "@/components/paginacion";
import {
  ESTADO_ASIGNACION_LABELS,
  ESTADOS_ASIGNACION,
  PROCESO_LABELS,
  etiquetaProceso,
  PROCESOS,
  diasEnProceso,
  formatoFecha,
  hoyMexico,
  type EquipoProduccion,
} from "@/lib/produccion/asignaciones";
import {
  consultarAsignaciones,
  entregasPorAsignacion,
  filtrosAQuery,
  leerFiltros,
  type FiltrosAsignaciones,
} from "@/lib/produccion/consultar-asignaciones";
import { enTaller } from "@/lib/produccion/atrasos";
import { plazosDePedidos } from "@/lib/produccion/cargar-taller";
import ChipPlazo from "../chip-plazo";
import RecordarFiltros from "./recordar-filtros";
import DetalleAsignacion, { EstadoAsignacionBadge } from "../asignaciones/detalle-asignacion";
import EstadoVacio from "@/components/estado-vacio";
import { estiloCampo } from "../asignaciones/modal";

const BASE = "/produccion/taller";

// Columnas de la lista en pantallas anchas (en celular cada asignación es una tarjeta).
const COLUMNAS =
  "xl:grid-cols-[5.5rem_minmax(0,1.3fr)_8.5rem_minmax(0,1fr)_6rem_7rem_3.5rem_8rem_7rem]";

// Vista "Lista" del taller: control de asignaciones: la "hoja" del encargado de Producción. Una fila
// por asignación (PM, modelo, cantidad, equipo, fecha de asignación, fecha de
// entrega, folio de la hoja y folios de Calidad); al desplegarla se ven las
// entregas con la foto de la hoja.
export default async function VistaLista({
  params,
}: {
  params: Record<string, string | string[] | undefined>;
}) {
  const filtros = leerFiltros(params);
  const pagina = Math.max(1, Number(Array.isArray(params.pagina) ? params.pagina[0] : params.pagina) || 1);

  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const puedeEditar = puedeEditarProduccion(perfil);
  const puedeAnular = puedeAdministrarProduccion(perfil);

  const [{ filas, total, error }, { data: equipos }] = await Promise.all([
    consultarAsignaciones(supabase, filtros, {
      desde: (pagina - 1) * TAMANO_PAGINA,
      hasta: pagina * TAMANO_PAGINA - 1,
    }),
    supabase
      .from("equipos_produccion")
      .select("id, nombre, encargado, es_planta, procesos, activo")
      .order("es_planta", { ascending: false })
      .order("nombre")
      .returns<EquipoProduccion[]>(),
  ]);
  const entregas = await entregasPorAsignacion(
    supabase,
    filas.map((f) => f.id)
  );
  const hoy = hoyMexico();
  // Plazo de entrega de los PM de esta página: marca las que van atrasadas.
  const plazos = await plazosDePedidos(
    supabase,
    filas.map((f) => f.pedido_id).filter((id): id is string => !!id),
    hoy
  );
  const sinFiltros = filtrosAQuery(filtros) === "";
  // Los filtros finos (equipo, proceso, fechas, un estado distinto de los accesos) van plegados.
  const hayFiltrosExtra = !!(filtros.equipo || filtros.proceso || filtros.desde || filtros.hasta);

  // Accesos rápidos: cada uno parte de cero (sin equipo/proceso/búsqueda).
  const base: FiltrosAsignaciones = { estado: "activas", equipo: null, proceso: null, q: "", desde: null, hasta: null };
  const definiciones: { etiqueta: string; filtros: FiltrosAsignaciones }[] = [
    { etiqueta: "En taller", filtros: base },
    { etiqueta: "Por verificar", filtros: { ...base, estado: "por_verificar" } },
    { etiqueta: "Todas", filtros: { ...base, estado: "todas" } },
  ];
  const atajos = definiciones.map((x) => ({
    ...x,
    activo: filtrosAQuery(x.filtros) === filtrosAQuery(filtros),
  }));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-slate-500">
        Lo que ya se mandó al taller, con su equipo y sus entregas. Para asignar un mueble, abre su pedido.
      </p>

      <RecordarFiltros />

      <nav aria-label="Accesos rápidos" className="flex flex-wrap gap-2 text-sm">
        {atajos.map((a) => (
          <Link
            key={a.etiqueta}
            href={`${BASE}${filtrosAQuery(a.filtros, { vista: "lista", ...(a.filtros.estado === "activas" ? { estado: "activas" } : {}) })}`}
            aria-current={a.activo ? "true" : undefined}
            className={`rounded-full border px-3 py-1.5 transition-colors ${
              a.activo
                ? "border-brand-500 bg-brand-50 font-medium text-brand-800"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {a.etiqueta}
          </Link>
        ))}
      </nav>

      <form method="get" className="flex flex-col gap-3 text-sm">
        <input type="hidden" name="vista" value="lista" />
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
            Buscar
            <input
              type="search"
              name="q"
              defaultValue={filtros.q}
              placeholder="Pedido, modelo o folio"
              className={estiloCampo}
            />
          </label>
          <button
            type="submit"
            className="min-h-10 rounded-lg bg-brand-500 px-4 py-2 font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400"
          >
            Buscar
          </button>
        </div>
        <details open={hayFiltrosExtra} className="group">
          <summary className="w-fit cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900">
            Más filtros{hayFiltrosExtra ? " (activos)" : ""}
          </summary>
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Estado
              <select name="estado" defaultValue={filtros.estado} className={estiloCampo}>
                <option value="activas">En taller (sin terminar)</option>
                <option value="por_verificar">Por verificar (entregas sin revisar)</option>
                {ESTADOS_ASIGNACION.map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_ASIGNACION_LABELS[e]}
                  </option>
                ))}
                <option value="todas">Todas</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Equipo
              <select name="equipo" defaultValue={filtros.equipo ?? ""} className={estiloCampo}>
                <option value="">Todos</option>
                {(equipos ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                    {e.activo ? "" : " (inactivo)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Proceso
              <select name="proceso" defaultValue={filtros.proceso ?? ""} className={estiloCampo}>
                <option value="">Todos</option>
                {PROCESOS.map((p) => (
                  <option key={p} value={p}>
                    {PROCESO_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Asignadas desde
              <input type="date" name="desde" defaultValue={filtros.desde ?? ""} className={estiloCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              hasta
              <input type="date" name="hasta" defaultValue={filtros.hasta ?? ""} className={estiloCampo} />
            </label>
            <button
              type="submit"
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Aplicar filtros
            </button>
            <Link href={`${BASE}?vista=lista&estado=activas`} className="px-1 py-2 text-slate-500 underline hover:text-slate-700">
              Limpiar
            </Link>
            <a
              href={`/api/produccion/asignaciones/exportar${filtrosAQuery(filtros)}`}
              className="px-1 py-2 text-slate-500 underline hover:text-slate-700"
            >
              Descargar Excel
            </a>
          </div>
        </details>
      </form>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar las asignaciones: {error}
        </p>
      )}

      {!error && filas.length === 0 && (
        <EstadoVacio
          titulo={sinFiltros ? "Todavía no hay asignaciones en taller" : "No hay asignaciones con estos filtros"}
          descripcion={
            sinFiltros
              ? "Abre un pedido, libera sus muebles y asígnalos a un equipo."
              : "Prueba con otra búsqueda o quita los filtros."
          }
          accion={
            sinFiltros
              ? { href: "/produccion", etiqueta: "Elegir un pedido" }
              : { href: `${BASE}?vista=lista&estado=todas`, etiqueta: "Ver todas" }
          }
        />
      )}

      {filas.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className={`hidden bg-slate-50 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid ${COLUMNAS}`}>
            <span>Pedido</span>
            <span>Modelo</span>
            <span className="text-right">Cantidad</span>
            <span>Equipo</span>
            <span>Asignación</span>
            <span>Entrega</span>
            <span className="text-right">Días</span>
            <span>Folios</span>
            <span>Estado</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {filas.map((a) => {
              const dias = diasEnProceso(a, hoy);
              // Solo lo que sigue en taller puede ir atrasado.
              const plazo = enTaller(a) && a.pedido_id ? plazos.get(a.pedido_id) : undefined;
              const encargado = a.es_planta ? "planta" : (a.encargado ?? a.equipo_encargado);
              return (
                <li key={a.id} className={plazo?.tipo === "vencido" ? "bg-rose-50/60" : ""}>
                  <div className={`flex flex-col gap-1.5 px-3 py-3 text-sm xl:grid xl:items-start xl:gap-x-3 xl:py-2 ${COLUMNAS}`}>
                    <div className="flex items-center justify-between gap-2 xl:block">
                      <span className="font-semibold text-slate-900">
                        {a.pedido_id ? (
                          <EnlaceFila
                            href={`/produccion/pedidos/${a.pedido_id}/asignaciones`}
                            className="hover:text-brand-700 hover:underline"
                          >
                            {a.numero_pedido}
                          </EnlaceFila>
                        ) : (
                          a.numero_pedido
                        )}
                      </span>
                      <span className="xl:hidden">
                        <EstadoAsignacionBadge estado={a.estado} />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-slate-900">{a.modelo ?? "—"}</span>
                      <span className="block truncate text-xs text-slate-500" title={a.descripcion ?? ""}>
                        {a.descripcion?.split("\n")[0]}
                      </span>
                    </div>
                    <div className="text-slate-700 xl:text-right">
                      <span className="font-medium text-slate-900">{Number(a.cantidad)} pza</span>
                      <span className="text-xs text-slate-500"> · entregadas {Number(a.entregado)}</span>
                      {Number(a.por_verificar) > 0 && (
                        <span className="block text-xs font-medium text-amber-700">
                          por verificar {Number(a.por_verificar)}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-slate-900">{a.equipo}</span>
                      <span className="block text-xs text-slate-500">
                        {etiquetaProceso(a)}
                        {encargado ? ` · ${encargado}` : ""}
                      </span>
                      {a.folio_rechazo && (
                        <span className="mt-0.5 block text-xs font-medium text-rose-700">
                          Retrabajo · {a.folio_rechazo}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-700">
                      <span className="text-xs text-slate-500 xl:hidden">Asignada: </span>
                      {formatoFecha(a.fecha_asignacion)}
                    </div>
                    <div className="text-slate-700">
                      <span className="text-xs text-slate-500 xl:hidden">Entrega: </span>
                      {a.estado === "entregada" ? formatoFecha(a.ultima_entrega) : "—"}
                      {plazo && (
                        <span className="mt-1 block">
                          <ChipPlazo plazo={plazo} fecha={plazo.fecha} />
                        </span>
                      )}
                    </div>
                    <div className="text-slate-700 xl:text-right">
                      <span className="text-xs text-slate-500 xl:hidden">Días en taller: </span>
                      {dias ?? "—"}
                    </div>
                    <div className="font-mono text-xs text-slate-700">
                      {a.folios_calidad ? <span className="block">Hoja: {a.folios_calidad}</span> : <span className="hidden xl:inline">—</span>}
                      {a.folios_cal && <span className="mt-0.5 block text-brand-800">{a.folios_cal}</span>}
                    </div>
                    <div className="hidden xl:block">
                      <EstadoAsignacionBadge estado={a.estado} />
                    </div>
                  </div>
                  <details className="group px-3 pb-3">
                    <summary className="w-fit cursor-pointer select-none text-sm font-medium text-brand-700 hover:underline">
                      {a.num_entregas > 0
                        ? `Ver ${a.num_entregas} entrega${a.num_entregas === 1 ? "" : "s"}, fotos y acciones`
                        : "Ver detalle y acciones"}
                    </summary>
                    <div className="mt-2 rounded-lg bg-slate-50 p-3">
                      <DetalleAsignacion
                        asignacion={a}
                        entregas={entregas.get(a.id) ?? []}
                        puedeEditar={puedeEditar}
                        puedeAnular={puedeAnular}
                      />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Paginacion
        pagina={pagina}
        total={total}
        href={(n) => `${BASE}${filtrosAQuery(filtros, { vista: "lista", pagina: String(n) })}`}
      />
    </div>
  );
}
