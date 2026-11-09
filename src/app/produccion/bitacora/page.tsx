import type { Metadata } from "next";
import Link from "next/link";
import { pmCorto } from "@/lib/planeacion/pm-corto";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import { hrefAsignarDeFila } from "@/lib/produccion/bitacora";
import {
  FILTROS_CAMBIO,
  FILTROS_MARCA,
  MAX_RENGLONES_CONTROL,
  conteosControl,
  filtrarControl,
  filtrarHistorial,
  leerFiltroCambio,
  leerFiltroMarca,
  type RenglonControl,
} from "@/lib/produccion/control-taller";
import { cargarControl, cargarEventos } from "@/lib/produccion/control-taller-db";
import { MOTIVOS_ACTIVOS, describirCambio, formatoFechaHora, type EventoMarca } from "@/lib/produccion/historial-marcas";
import MarcaSeleccionable from "../marca-seleccionable";
import BotonImprimir from "./boton-imprimir";

export const metadata: Metadata = { title: "Bitácora" };

const MAX_FILAS_HISTORIAL = 300;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Columnas de la lista de control y del historial en pantallas anchas.
const COLUMNAS_CONTROL = MOTIVOS_ACTIVOS
  ? "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_6.5rem_minmax(0,1.2fr)_5rem]"
  : "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_4.5rem_5rem]";
// Columna de la acción (Asignar o Liberar): después del motivo si se muestra.
const COLUMNA_ACCION = MOTIVOS_ACTIVOS ? "sm:col-start-7" : "sm:col-start-6";
const COLUMNAS_HISTORIAL = MOTIVOS_ACTIVOS
  ? "sm:grid-cols-[7.5rem_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)]"
  : "sm:grid-cols-[7.5rem_minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]";

const estiloCampo =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none";

// Bitácora de taller: la lista de control de todos los muebles (palomita, tache o sin marcar, con su
// motivo) y el historial de cambios de cada marca. Se filtra, se imprime y se baja a Excel.
export default async function BitacoraPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const vista = uno(params.vista) === "historial" ? "historial" : "control";
  const q = (uno(params.q) ?? "").trim().slice(0, 100);

  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const puedeEditar = puedeEditarProduccion(perfil);

  // Dirección de la misma pantalla con otra vista, conservando la búsqueda.
  const hrefVista = (v: "control" | "historial") => {
    const p = new URLSearchParams();
    if (v === "historial") p.set("vista", "historial");
    if (q) p.set("q", q);
    const t = p.toString();
    return t ? `/produccion/bitacora?${t}` : "/produccion/bitacora";
  };

  const marca = leerFiltroMarca(uno(params.marca));
  const cambio = leerFiltroCambio(uno(params.cambio));
  const desdeP = uno(params.desde);
  const hastaP = uno(params.hasta);
  const desde = desdeP && FECHA.test(desdeP) ? desdeP : null;
  const hasta = hastaP && FECHA.test(hastaP) ? hastaP : null;

  // Para el Excel: los mismos filtros que se ven.
  const exportar = new URLSearchParams({ vista });
  if (q) exportar.set("q", q);
  if (vista === "control" && marca !== "todas") exportar.set("marca", marca);
  if (vista === "historial") {
    if (cambio !== "todos") exportar.set("cambio", cambio);
    if (desde) exportar.set("desde", desde);
    if (hasta) exportar.set("hasta", hasta);
  }

  const control = vista === "control" ? await cargarControl(supabase) : [];
  const historial = vista === "historial" ? await cargarEventos(supabase) : { eventos: [], error: null };

  const conteos = conteosControl(control);
  const renglones = filtrarControl(control, { marca, q });
  const eventos = filtrarHistorial(historial.eventos, { cambio, q, desde, hasta });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-2.5 sm:gap-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bitácora de taller</h1>
          <p className="mt-1 text-sm text-slate-500">
            {vista === "control"
              ? `${conteos.todas} renglones · ${conteos.no} no están · ${conteos.sin} sin marcar · ${conteos.si} sí están`
              : MOTIVOS_ACTIVOS
                ? "Cada cambio de palomita o tache, con su motivo y quién lo hizo."
                : "Cada cambio de palomita o tache y quién lo hizo."}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <a
            href={`/api/produccion/bitacora/exportar?${exportar.toString()}`}
            className="rounded-md border border-brand-600 px-3 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
          >
            Descargar Excel
          </a>
          <BotonImprimir />
        </div>
      </div>

      <nav aria-label="Vista de la bitácora" className="flex gap-1 print:hidden">
        {(["control", "historial"] as const).map((v) => (
          <Link
            key={v}
            href={hrefVista(v)}
            aria-current={vista === v ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              vista === v ? "bg-brand-500 text-on-brand" : "text-slate-600 hover:bg-brand-50"
            }`}
          >
            {v === "control" ? "Lista de control" : "Historial"}
          </Link>
        ))}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
        {vista === "historial" && <input type="hidden" name="vista" value="historial" />}
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Buscar
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={MOTIVOS_ACTIVOS ? "Modelo, PM, O.T., equipo o motivo" : "Modelo, PM, O.T. o equipo"}
            className={`${estiloCampo} font-normal normal-case tracking-normal`}
          />
        </label>
        {vista === "control" ? (
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Marca
            <select name="marca" defaultValue={marca} className={`${estiloCampo} font-normal normal-case tracking-normal`}>
              {FILTROS_MARCA.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.etiqueta} ({conteos[f.valor]})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cambio
              <select name="cambio" defaultValue={cambio} className={`${estiloCampo} font-normal normal-case tracking-normal`}>
                {FILTROS_CAMBIO.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Desde
              <input type="date" name="desde" defaultValue={desde ?? ""} className={`${estiloCampo} font-normal`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Hasta
              <input type="date" name="hasta" defaultValue={hasta ?? ""} className={`${estiloCampo} font-normal`} />
            </label>
          </>
        )}
        <button type="submit" className="rounded-md bg-brand-500 px-4 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-400">
          Filtrar
        </button>
        <Link href={vista === "historial" ? "/produccion/bitacora?vista=historial" : "/produccion/bitacora"} className="px-1 py-2 text-sm text-slate-500 underline hover:text-slate-700">
          Limpiar
        </Link>
      </form>

      {vista === "control" ? (
        <ListaControl renglones={renglones} puedeEditar={puedeEditar} />
      ) : (
        <ListaHistorial eventos={eventos} error={historial.error} />
      )}
    </main>
  );
}

function ListaControl({ renglones, puedeEditar }: { renglones: RenglonControl[]; puedeEditar: boolean }) {
  const visibles = renglones.slice(0, MAX_RENGLONES_CONTROL);
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className={`hidden gap-x-3 border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400 sm:grid ${COLUMNAS_CONTROL}`}>
        <span>Mueble</span>
        <span>Equipo</span>
        <span>Tiene</span>
        <span>O.T. · PM</span>
        <span className="text-center">Está</span>
        {MOTIVOS_ACTIVOS && <span>Motivo</span>}
        <span />
      </div>
      {visibles.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">No hay renglones con esos filtros.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visibles.map((r) => (
            <FilaControl key={r.clave} r={r} puedeEditar={puedeEditar} />
          ))}
        </ul>
      )}
      {renglones.length > visibles.length && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          Se muestran {visibles.length} de {renglones.length}; el Excel baja todos.
        </p>
      )}
    </section>
  );
}

function FilaControl({ r, puedeEditar }: { r: RenglonControl; puedeEditar: boolean }) {
  const ot = r.ot ? `O.T. ${r.ot}` : "Sin O.T.";
  const accion = r.porLiberar
    ? { href: `/produccion/pedidos/${r.pedidoId}`, texto: "Liberar" }
    : { href: hrefAsignarDeFila({ numero_pedido: r.numeroPm, estaEnTaller: r.estado === "En taller" }), texto: "Asignar" };
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 ${COLUMNAS_CONTROL}`}>
      <span className="min-w-0 sm:col-start-1 sm:row-start-1">
        <span className="block truncate text-sm font-semibold text-slate-900">{r.modelo}</span>
        {r.proceso && <span className="block truncate text-xs text-slate-500">{r.proceso}</span>}
      </span>

      <span className="flex justify-end sm:col-start-5 sm:row-start-1 sm:justify-center">
        <MarcaSeleccionable
          asignacionId={r.asignacionId ?? undefined}
          itemId={r.itemId ?? undefined}
          inicial={r.marca}
          notaInicial={r.nota}
          puedeEditar={puedeEditar}
          titulo={`${r.modelo} · ${r.equipo ?? `sin equipo (${r.numeroPm})`}`}
        />
      </span>

      <span className="col-span-2 min-w-0 text-sm text-slate-700 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        {r.equipo ?? <span className="text-slate-400">Sin equipo</span>}
        <span className="block text-xs text-slate-500">{r.estado}</span>
      </span>

      <span className="col-span-2 text-xs tabular-nums text-slate-700 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:text-sm">
        <span className="text-slate-500 sm:hidden">Tiene: </span>
        <b className="font-semibold">{r.tiene}</b> de {r.cantidad} {r.unidad ?? ""}
      </span>

      <span className="col-span-2 min-w-0 truncate text-xs text-slate-600 sm:col-span-1 sm:col-start-4 sm:row-start-1" title={`${ot} · ${r.numeroPm}`}>
        <span className="font-medium text-slate-800">{ot}</span> · {pmCorto(r.numeroPm)}
      </span>

      {MOTIVOS_ACTIVOS && (
        <span className="col-span-2 min-w-0 text-xs text-slate-700 sm:col-span-1 sm:col-start-6 sm:row-start-1">
          {r.nota ? <span title={r.nota}>“{r.nota}”</span> : <span className="text-slate-300">—</span>}
        </span>
      )}

      <Link
        href={accion.href}
        title={r.porLiberar ? "Primero hay que liberarlo desde el pedido" : undefined}
        className={`col-span-2 rounded-md border border-brand-600 px-3 py-1.5 text-center text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 print:hidden sm:col-span-1 ${COLUMNA_ACCION} sm:row-start-1`}
      >
        {accion.texto}
      </Link>
    </li>
  );
}

function ListaHistorial({ eventos, error }: { eventos: EventoMarca[]; error: string | null }) {
  const visibles = eventos.slice(0, MAX_FILAS_HISTORIAL);
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className={`hidden gap-x-3 border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400 sm:grid ${COLUMNAS_HISTORIAL}`}>
        <span>Fecha</span>
        <span>Mueble</span>
        <span>O.T. · PM</span>
        <span>Equipo</span>
        <span>Cambio</span>
        {MOTIVOS_ACTIVOS && <span>Motivo</span>}
        <span>Quién</span>
      </div>
      {error ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">El historial no se pudo leer: {error}</p>
      ) : visibles.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Todavía no hay cambios con esos filtros.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visibles.map((e) => (
            <li key={e.id} className={`grid grid-cols-1 gap-x-3 gap-y-0.5 px-4 py-3 text-sm ${COLUMNAS_HISTORIAL}`}>
              <span className="text-xs tabular-nums text-slate-500 sm:text-sm sm:text-slate-700">{formatoFechaHora(e.hecho_en)}</span>
              <span className="min-w-0 truncate font-semibold text-slate-900">{e.modelo ?? "—"}</span>
              <span className="min-w-0 truncate text-xs text-slate-600">
                <span className="font-medium text-slate-800">{e.orden_trabajo ? `O.T. ${e.orden_trabajo}` : "Sin O.T."}</span> ·{" "}
                {e.numero_pedido ? pmCorto(e.numero_pedido) : "—"}
              </span>
              <span className="min-w-0 truncate text-slate-700">{e.equipo ?? <span className="text-slate-400">Sin equipo</span>}</span>
              <span className="min-w-0">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    e.esta === true
                      ? "bg-emerald-100 text-emerald-800"
                      : e.esta === false
                        ? "bg-rose-100 text-rose-800"
                        : "bg-slate-100 text-slate-600"
                  }`}
                  title={describirCambio(e)}
                >
                  {describirCambio(e)}
                </span>
              </span>
              {MOTIVOS_ACTIVOS && (
                <span className="min-w-0 text-xs text-slate-700">{e.nota ? `“${e.nota}”` : <span className="text-slate-300">—</span>}</span>
              )}
              <span className="min-w-0 truncate text-xs text-slate-500">{e.hecho_por_nombre ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
      {eventos.length > visibles.length && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          Se muestran {visibles.length} de {eventos.length}; el Excel baja todos.
        </p>
      )}
    </section>
  );
}
