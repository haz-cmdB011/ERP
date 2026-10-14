import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { paginarTodo } from "@/lib/supabase/paginar";
import { getPerfilActual, puedeEvaluarCalidad } from "@/lib/auth/get-perfil";
import EstadoVacio from "@/components/estado-vacio";
import {
  ESTADOS_INCIDENCIA,
  LINEAS,
  SIN_FILTROS,
  TIPOS_INCIDENCIA,
  filtrarIncidencias,
  hrefIncidencias,
  leerFiltrosIncidencias,
  resumirIncidencias,
  type FiltrosIncidencias,
  type Incidencia,
  type ParametrosIncidencias,
} from "@/lib/calidad/incidencias";
import Barras from "./barras";

export const metadata = { title: "Incidencias" };

const BASE = "/calidad/incidencias";
const FILAS_EN_LISTA = 100;

const COLUMNAS =
  "id, linea, tipo, proyecto, muebles, areas, motivo, categoria_motivo, areas_reporta, estado";

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

const CAMPO = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500";
const SELECT =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900";

export default async function IncidenciasPage({ searchParams }: { searchParams: Promise<ParametrosIncidencias> }) {
  const filtros = leerFiltrosIncidencias(await searchParams);
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

  const filas = filtrarIncidencias(todas, filtros);
  const r = resumirIncidencias(filas);
  const opcionesArea = resumirIncidencias(todas).porArea.map((a) => a.nombre);
  const opcionesProyecto = resumirIncidencias(todas).porProyecto.map((p) => p.nombre);
  const hayFiltros = Object.values(filtros).some(Boolean);
  const noConformes = r.porTipo.find((t) => t.nombre === "Producto No Conforme")?.total ?? 0;

  const filtrarPor = (cambios: Partial<FiltrosIncidencias>) => hrefIncidencias(BASE, { ...filtros, ...cambios });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Incidencias</h1>
        <p className="text-sm text-slate-500">
          Reportes de no conformidad, desviaciones, incidencias y mejoras. En las gráficas, la parte ámbar es lo que
          sigue abierto.
        </p>
      </div>

      <form method="get" action={BASE} className="flex flex-wrap items-end gap-3">
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
          <Link href={hrefIncidencias(BASE, SIN_FILTROS)} className="py-2 text-sm text-slate-500 underline hover:text-slate-700">
            Limpiar
          </Link>
        )}
      </form>

      {todas.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay incidencias"
          descripcion="Se cargan desde el Excel de control con el script de importación."
        />
      ) : filas.length === 0 ? (
        <EstadoVacio titulo="Ninguna incidencia coincide" descripcion="Prueba con otros filtros o quítalos." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Indicador
              etiqueta="Incidencias"
              valor={String(r.total)}
              nota={`Madera ${r.porLinea.madera} · Metal ${r.porLinea.metal}`}
            />
            <Indicador etiqueta="Abiertas" valor={String(r.abiertas)} nota={`${porcentaje(r.abiertas, r.total)} del total`} />
            <Indicador etiqueta="Cerradas" valor={String(r.cerradas)} nota={`${porcentaje(r.cerradas, r.total)} del total`} />
            <Indicador
              etiqueta="Producto no conforme"
              valor={porcentaje(noConformes, r.total)}
              nota={`${noConformes} de ${r.total}`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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

          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Dónde nace y quién lo detecta</h2>
              <p className="text-xs text-slate-500">Los pares más frecuentes entre el área involucrada y el área que reporta.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-4 font-semibold">Nace en</th>
                    <th className="py-2 pr-4 font-semibold">Lo detecta</th>
                    <th className="py-2 text-right font-semibold">Incidencias</th>
                  </tr>
                </thead>
                <tbody>
                  {r.cruceAreaReporta.slice(0, 8).map((c) => (
                    <tr key={`${c.area}|${c.reporta}`} className="border-t border-slate-100">
                      <td className="py-2 pr-4 text-slate-700">{c.area}</td>
                      <td className="py-2 pr-4 text-slate-700">{c.reporta}</td>
                      <td className="py-2 text-right tabular-nums text-slate-900">{c.total}</td>
                    </tr>
                  ))}
                  {r.cruceAreaReporta.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-3 text-slate-500">
                        Sin datos con estos filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Lista{" "}
              <span className="font-normal text-slate-500">
                ({filas.length > FILAS_EN_LISTA ? `primeras ${FILAS_EN_LISTA} de ${filas.length}; usa los filtros para acotar` : filas.length})
              </span>
            </h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 font-semibold">Tipo</th>
                    <th className="px-3 py-2 font-semibold">Proyecto</th>
                    <th className="px-3 py-2 font-semibold">Muebles</th>
                    <th className="px-3 py-2 font-semibold">Áreas</th>
                    <th className="px-3 py-2 font-semibold">Motivo</th>
                    <th className="px-3 py-2 font-semibold">Reporta</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, FILAS_EN_LISTA).map((i) => (
                    <tr key={i.id} className="border-t border-slate-100 align-top">
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
    </main>
  );
}
