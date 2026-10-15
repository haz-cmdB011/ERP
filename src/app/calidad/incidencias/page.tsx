import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { paginarTodo } from "@/lib/supabase/paginar";
import { getPerfilActual, puedeEvaluarCalidad } from "@/lib/auth/get-perfil";
import EstadoVacio from "@/components/estado-vacio";
import {
  ESTADOS_INCIDENCIA,
  LINEAS,
  SIN_AUDITOR,
  SIN_FILTROS,
  TIPOS_INCIDENCIA,
  desglosarPeriodo,
  filasDelPeriodo,
  filtrarIncidencias,
  hrefIncidencias,
  leerFiltrosIncidencias,
  leerRef,
  leerVista,
  periodoDe,
  refPorDefecto,
  resumirIncidencias,
  resumirPorAuditor,
  resumirPorSemana,
  semanaDe,
  type FiltrosIncidencias,
  type Incidencia,
  type ParametrosIncidencias,
  type Subperiodo,
  type Vista,
} from "@/lib/calidad/incidencias";
import Barras from "./barras";
import Semanas from "./semanas";
import SelectorPeriodo from "./selector-periodo";
import TablaAuditores from "./tabla-auditores";
import { FRENTE_A, diaConSemana, diaCorto, etiquetaPeriodo, nombreMes, rangoCorto } from "./formato";

export const metadata = { title: "Incidencias" };

const BASE = "/calidad/incidencias";
const FILAS_EN_LISTA = 100;

const COLUMNAS =
  "id, linea, tipo, proyecto, muebles, areas, motivo, categoria_motivo, areas_reporta, estado, fecha, auditor";

const NOMBRE_LINEA = { madera: "Madera", metal: "Metal" } as const;

function porcentaje(parte: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((parte / total) * 100)}%`;
}

function Indicador({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{etiqueta}</p>
      <p className="text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
      <p className="text-xs text-slate-400">{nota}</p>
    </div>
  );
}

// Nombre con el que se rotula cada parte de un periodo en la lista de barras.
function etiquetaSubperiodo(s: Subperiodo): string {
  if (s.vista === "dia") return diaConSemana(s.inicio);
  if (s.vista === "semana") return `Sem ${semanaDe(s.inicio)?.numero} (${rangoCorto(s.inicio, s.fin)})`;
  return nombreMes(s.inicio);
}

const TITULO_DESGLOSE: Record<Vista, string> = {
  dia: "",
  semana: "Por día",
  mes: "Por semana",
  anio: "Por mes",
};

const DE_QUE: Record<Vista, string> = {
  dia: "del día",
  semana: "de la semana",
  mes: "del mes",
  anio: "del año",
};

const CAMPO = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500";
const SELECT =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900";

export default async function IncidenciasPage({ searchParams }: { searchParams: Promise<ParametrosIncidencias> }) {
  const parametros = await searchParams;
  const filtros = leerFiltrosIncidencias(parametros);
  const vista = leerVista(parametros.vista);
  const supabase = await createClient();

  // La política de lectura es solo para Calidad: sin este aviso, otro rol vería
  // "no hay incidencias" cuando en realidad la base no le deja ver ninguna.
  const perfil = await getPerfilActual(supabase);
  if (!puedeEvaluarCalidad(perfil)) {
    return (
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
        <EstadoVacio
          titulo="Las incidencias son solo de Calidad"
          descripcion="Pide acceso al área de Calidad si necesitas verlas."
        />
      </main>
    );
  }

  const todas = await paginarTodo<Incidencia>(
    (desde, hasta) =>
      supabase
        .from("incidencias_calidad")
        .select(COLUMNAS)
        .order("linea", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, hasta)
        .returns<Incidencia[]>(),
    { contexto: "las incidencias" }
  );

  // Hoy en la hora de la empresa ("en-CA" da AAAA-MM-DD).
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const dia = leerRef(parametros.ref) ?? refPorDefecto(todas, hoy, vista);
  const periodo = periodoDe(vista, dia);

  const filtradas = filtrarIncidencias(todas, filtros);
  const delPeriodo = filasDelPeriodo(filtradas, periodo).sort(
    (a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || a.id.localeCompare(b.id)
  );
  const delAnterior = filasDelPeriodo(filtradas, periodoDe(vista, periodo.anterior));
  const sinFecha = filtradas.filter((i) => !i.fecha).length;

  const r = resumirIncidencias(delPeriodo);
  const auditores = resumirPorAuditor(delPeriodo);
  const desglose = desglosarPeriodo(delPeriodo, periodo);
  const porEtiqueta = new Map(desglose.map((s) => [etiquetaSubperiodo(s), s]));
  const semanasDelAnio = vista === "anio" ? resumirPorSemana(delPeriodo).semanas : [];

  // Las opciones de los filtros salen de todo lo cargado, no solo del periodo.
  const resumenTodo = resumirIncidencias(todas);
  const opcionesArea = resumenTodo.porArea.map((a) => a.nombre);
  const opcionesProyecto = resumenTodo.porProyecto.map((p) => p.nombre);
  const opcionesAuditor = resumirPorAuditor(todas).map((a) => a.nombre);
  const hayFiltros = Object.values(filtros).some(Boolean);
  const diferencia = delPeriodo.length - delAnterior.length;

  const ir = (v: Vista, d: string) => hrefIncidencias(BASE, filtros, { vista: v, ref: d });
  const filtrarPor = (cambios: Partial<FiltrosIncidencias>) =>
    hrefIncidencias(BASE, { ...filtros, ...cambios }, { vista, ref: dia });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Incidencias</h1>
        <p className="text-sm text-slate-500">
          Reportes de no conformidad, desviaciones, incidencias y mejoras, por día, semana, mes o año. En las gráficas,
          la parte ámbar es lo que sigue abierto.
        </p>
      </div>

      <SelectorPeriodo periodo={periodo} dia={dia} hoy={hoy} hrefDe={ir} />

      <form method="get" action={BASE} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="vista" value={vista} />
        <input type="hidden" name="ref" value={dia} />
        <label className={CAMPO}>
          Línea
          <select name="linea" defaultValue={filtros.linea ?? ""} className={SELECT}>
            <option value="">Todas</option>
            {LINEAS.map((l) => (
              <option key={l} value={l}>
                {NOMBRE_LINEA[l]}
              </option>
            ))}
          </select>
        </label>
        <label className={CAMPO}>
          Tipo
          <select name="tipo" defaultValue={filtros.tipo ?? ""} className={SELECT}>
            <option value="">Todos</option>
            {TIPOS_INCIDENCIA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className={CAMPO}>
          Estado
          <select name="estado" defaultValue={filtros.estado ?? ""} className={SELECT}>
            <option value="">Todos</option>
            {ESTADOS_INCIDENCIA.map((e) => (
              <option key={e} value={e}>
                {e === "abierto" ? "Abierto" : "Cerrado"}
              </option>
            ))}
          </select>
        </label>
        <label className={CAMPO}>
          Auditó
          <select name="auditor" defaultValue={filtros.auditor ?? ""} className={SELECT}>
            <option value="">Todos</option>
            {opcionesAuditor.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className={CAMPO}>
          Área
          <select name="area" defaultValue={filtros.area ?? ""} className={SELECT}>
            <option value="">Todas</option>
            {opcionesArea.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className={`${CAMPO} min-w-[12rem] flex-1`}>
          Proyecto
          <select name="proyecto" defaultValue={filtros.proyecto ?? ""} className={SELECT}>
            <option value="">Todos</option>
            {opcionesProyecto.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400"
        >
          Filtrar
        </button>
        {hayFiltros && (
          <Link
            href={hrefIncidencias(BASE, SIN_FILTROS, { vista, ref: dia })}
            className="py-2 text-sm text-slate-500 underline hover:text-slate-700"
          >
            Limpiar
          </Link>
        )}
      </form>

      {todas.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay incidencias"
          descripcion="Se cargan desde el Excel de control con el script de importación."
        />
      ) : (
        <>
          {delPeriodo.length === 0 ? (
            <EstadoVacio
              titulo={`Sin reportes ${vista === "dia" ? "este día" : vista === "semana" ? "esta semana" : vista === "mes" ? "este mes" : "este año"}`}
              descripcion={
                hayFiltros
                  ? `No hay incidencias en ${etiquetaPeriodo(periodo)} con estos filtros.`
                  : `No hay incidencias en ${etiquetaPeriodo(periodo)}. Usa las flechas para ir a otro periodo.`
              }
              accion={{ href: ir(vista, refPorDefecto(todas, "9999-12-31", vista)), etiqueta: "Ir al último con reportes" }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Indicador
                  etiqueta="Reportes generados"
                  valor={String(r.total)}
                  nota={`${diferencia === 0 ? "Igual que" : `${diferencia > 0 ? "+" : ""}${diferencia} frente a`} ${FRENTE_A[vista]}`}
                />
                <Indicador etiqueta="Abiertos" valor={String(r.abiertas)} nota={`${porcentaje(r.abiertas, r.total)} del periodo`} />
                <Indicador etiqueta="Cerrados" valor={String(r.cerradas)} nota={`${porcentaje(r.cerradas, r.total)} del periodo`} />
                <Indicador
                  etiqueta="Auditores"
                  valor={String(auditores.filter((a) => a.nombre !== SIN_AUDITOR).length)}
                  nota={`Madera ${r.porLinea.madera} · Metal ${r.porLinea.metal}`}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <TablaAuditores auditores={auditores} hrefDe={(nombre) => filtrarPor({ auditor: nombre })} />
                {vista !== "dia" && (
                  <Barras
                    titulo={TITULO_DESGLOSE[vista]}
                    descripcion={`Cómo se reparten los ${r.total} reportes ${DE_QUE[vista]}`}
                    filas={desglose.map((s) => ({ nombre: etiquetaSubperiodo(s), total: s.total, abiertas: s.abiertas }))}
                    maximo={40}
                    hrefDe={(nombre) => {
                      const s = porEtiqueta.get(nombre);
                      return s ? ir(s.vista, s.ref) : ir(vista, dia);
                    }}
                  />
                )}
              </div>

              {vista === "anio" && <Semanas semanas={semanasDelAnio} hrefDe={(inicio) => ir("semana", inicio)} />}

              <details open className="flex flex-col gap-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Detalle de {etiquetaPeriodo(periodo)}
                </summary>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Barras
                    titulo="Por tipo de reporte"
                    filas={r.porTipo}
                    hrefDe={(n) => filtrarPor({ tipo: TIPOS_INCIDENCIA.find((t) => t === n) ?? null })}
                  />
                  <Barras
                    titulo="Por categoría del motivo"
                    descripcion="Agrupación de los motivos escritos a mano"
                    filas={r.porCategoria}
                    maximo={9}
                  />
                  <Barras
                    titulo="Áreas involucradas"
                    descripcion="Dónde nace la no conformidad; una incidencia cuenta en cada área que menciona"
                    filas={r.porArea}
                    maximo={10}
                    hrefDe={(n) => filtrarPor({ area: n })}
                  />
                  <Barras
                    titulo="Área que reporta"
                    descripcion="Quién la detecta"
                    filas={r.porAreaQueReporta}
                    maximo={10}
                  />
                  <Barras titulo="Motivos más repetidos" filas={r.porMotivo} maximo={10} />
                  <Barras
                    titulo="Proyectos con más incidencias"
                    filas={r.porProyecto}
                    maximo={10}
                    hrefDe={(n) => filtrarPor({ proyecto: n })}
                  />
                </div>
              </details>

              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Lista{" "}
                  <span className="font-normal text-slate-500">
                    (
                    {delPeriodo.length > FILAS_EN_LISTA
                      ? `primeras ${FILAS_EN_LISTA} de ${delPeriodo.length}; usa los filtros para acotar`
                      : delPeriodo.length}
                    )
                  </span>
                </h2>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Fecha</th>
                        <th className="px-3 py-2 font-semibold">Estado</th>
                        <th className="px-3 py-2 font-semibold">Auditó</th>
                        <th className="px-3 py-2 font-semibold">Tipo</th>
                        <th className="px-3 py-2 font-semibold">Proyecto</th>
                        <th className="px-3 py-2 font-semibold">Muebles</th>
                        <th className="px-3 py-2 font-semibold">Áreas</th>
                        <th className="px-3 py-2 font-semibold">Motivo</th>
                        <th className="px-3 py-2 font-semibold">Reporta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delPeriodo.slice(0, FILAS_EN_LISTA).map((i) => (
                        <tr key={i.id} className="border-t border-slate-100 align-top">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                            {i.fecha ? diaCorto(i.fecha) : "—"}
                            {i.fecha && <span className="block text-xs text-slate-400">Sem {semanaDe(i.fecha)?.numero}</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                                i.estado === "abierto"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {i.estado === "abierto" ? "Abierto" : "Cerrado"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-700">{i.auditor ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{i.tipo}</td>
                          <td className="px-3 py-2 text-slate-700">{i.proyecto ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{i.muebles.join(", ") || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{i.areas.join(", ") || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">
                            {i.motivo ?? "—"}
                            <span className="block text-xs text-slate-400">{i.categoria_motivo}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-700">{i.areas_reporta.join(", ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {sinFecha > 0 && (
            <p className="text-xs text-slate-400">
              {sinFecha} {sinFecha === 1 ? "incidencia no tiene" : "incidencias no tienen"} fecha y por eso no aparece
              {sinFecha === 1 ? "" : "n"} en ningún día, semana, mes o año.
            </p>
          )}
        </>
      )}
    </main>
  );
}
