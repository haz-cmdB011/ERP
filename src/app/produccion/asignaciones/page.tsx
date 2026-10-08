import type { Metadata } from "next";
import Link from "next/link";
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
import DetalleAsignacion, { EstadoAsignacionBadge } from "./detalle-asignacion";
import { estiloCampo } from "./modal";

export const metadata: Metadata = { title: "Asignaciones" };

// Control de asignaciones: la "hoja" del encargado de Producción. Una fila
// por asignación (PM, modelo, cantidad, equipo, fecha de asignación, fecha de
// entrega, folios de Calidad); al desplegarla se ven las entregas con la foto.
export default async function AsignacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
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

  // Accesos rápidos: cada uno parte de cero (sin equipo/proceso/búsqueda).
  const base: FiltrosAsignaciones = { estado: "activas", equipo: null, proceso: null, q: "", desde: null, hasta: null };
  const [a, m, d] = hoy.split("-").map(Number);
  const hace7 = new Date(Date.UTC(a, m - 1, d - 6)).toISOString().slice(0, 10);
  const definiciones: { etiqueta: string; filtros: FiltrosAsignaciones }[] = [
    { etiqueta: "En taller", filtros: base },
    { etiqueta: "Por verificar", filtros: { ...base, estado: "por_verificar" } },
    { etiqueta: "Asignadas esta semana", filtros: { ...base, estado: "todas", desde: hace7 } },
    { etiqueta: "Entregadas", filtros: { ...base, estado: "entregada" } },
    { etiqueta: "Todas", filtros: { ...base, estado: "todas" } },
  ];
  const atajos = definiciones.map((x) => ({
    ...x,
    activo: filtrosAQuery(x.filtros) === filtrosAQuery(filtros),
  }));

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Asignaciones</h1>
          <p className="mt-1 text-sm text-slate-500">
            Qué tiene cada equipo y cuándo lo entregó. Para asignar, entra a un pedido y usa “Asignar a
            equipos”. Cada entrega se revisa aquí antes de pasar a Calidad.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/produccion/equipos"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
          >
            Equipos
          </Link>
          <a
            href={`/api/produccion/asignaciones/exportar${filtrosAQuery(filtros)}`}
            className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400"
          >
            Descargar Excel
          </a>
        </div>
      </div>

      <RecordarFiltros />

      <nav aria-label="Accesos rápidos" className="flex flex-wrap gap-2 text-sm">
        {atajos.map((a) => (
          <Link
            key={a.etiqueta}
            href={`/produccion/asignaciones${filtrosAQuery(a.filtros, a.filtros.estado === "activas" ? { estado: "activas" } : {})}`}
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

      <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Buscar
          <input
            type="search"
            name="q"
            defaultValue={filtros.q}
            placeholder="PM, modelo o folio de Calidad"
            className={estiloCampo}
          />
        </label>
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
          className="rounded-lg bg-brand-500 px-4 py-2 font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400"
        >
          Filtrar
        </button>
        <Link href="/produccion/asignaciones?estado=activas" className="px-1 py-2 text-slate-500 underline hover:text-slate-700">
          Limpiar
        </Link>
      </form>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar las asignaciones: {error}
        </p>
      )}

      {!error && filas.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          {sinFiltros ? (
            <>
              <p>Todavía no hay asignaciones en taller.</p>
              <Link href="/produccion" className="font-medium text-brand-700 hover:underline">
                Elegir un pedido para asignar →
              </Link>
            </>
          ) : (
            <>
              <p>No hay asignaciones con estos filtros.</p>
              <Link
                href="/produccion/asignaciones?estado=todas"
                className="font-medium text-brand-700 hover:underline"
              >
                Quitar filtros y ver todas →
              </Link>
            </>
          )}
        </div>
      )}

      {filas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">PM</th>
                <th className="px-3 py-3">Modelo</th>
                <th className="px-3 py-3 text-right">Cantidad</th>
                <th className="px-3 py-3">Equipo</th>
                <th className="px-3 py-3">Asignación</th>
                <th className="px-3 py-3">Entrega</th>
                <th className="px-3 py-3 text-right">Días</th>
                <th className="px-3 py-3">Folios de Calidad</th>
                <th className="px-3 py-3">Estado</th>
              </tr>
            </thead>
            {filas.map((a) => {
              const dias = diasEnProceso(a, hoy);
              // Solo lo que sigue en taller puede ir atrasado.
              const plazo = enTaller(a) && a.pedido_id ? plazos.get(a.pedido_id) : undefined;
              return (
                <tbody key={a.id} className="border-t border-slate-100">
                  <tr className={`align-top ${plazo?.tipo === "vencido" ? "bg-rose-50/60" : ""}`}>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {a.pedido_id ? (
                        <Link
                          href={`/produccion/pedidos/${a.pedido_id}/asignaciones`}
                          className="hover:text-brand-700 hover:underline"
                        >
                          {a.numero_pedido}
                        </Link>
                      ) : (
                        a.numero_pedido
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-900">{a.modelo ?? "—"}</span>
                      <span className="block max-w-xs truncate text-xs text-slate-500" title={a.descripcion ?? ""}>
                        Ítem {a.item_code} · {a.descripcion?.split("\n")[0]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <span className="font-medium text-slate-900">{Number(a.cantidad)}</span>
                      <span className="block text-xs text-slate-500">entregadas {Number(a.entregado)}</span>
                      {Number(a.por_verificar) > 0 && (
                        <span className="block text-xs font-medium text-amber-700">
                          por verificar {Number(a.por_verificar)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-900">{a.equipo}</span>
                      <span className="block text-xs text-slate-500">
                        {PROCESO_LABELS[a.proceso]}
                        {a.es_planta ? " · planta" : a.equipo_encargado ? ` · ${a.equipo_encargado}` : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatoFecha(a.fecha_asignacion)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {a.estado === "entregada" ? formatoFecha(a.ultima_entrega) : "—"}
                      {plazo && (
                        <span className="mt-1 block">
                          <ChipPlazo plazo={plazo} fecha={plazo.fecha} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{dias ?? "—"}</td>
                    <td className="max-w-[12rem] px-3 py-2 font-mono text-xs text-slate-700">
                      {a.folios_calidad ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <EstadoAsignacionBadge estado={a.estado} />
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={9} className="px-3 pb-3">
                      <details className="group">
                        <summary className="cursor-pointer text-xs font-medium text-brand-700 hover:underline">
                          {a.num_entregas > 0
                            ? `${a.num_entregas} entrega${a.num_entregas === 1 ? "" : "s"} · ver fotos y acciones`
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
                    </td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      <Paginacion
        pagina={pagina}
        total={total}
        href={(n) => `/produccion/asignaciones${filtrosAQuery(filtros, { pagina: String(n) })}`}
      />
    </main>
  );
}
