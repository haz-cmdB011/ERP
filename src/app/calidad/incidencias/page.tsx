import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { paginarTodo } from "@/lib/supabase/paginar";
import { getPerfilActual, puedeEvaluarCalidad } from "@/lib/auth/get-perfil";
import EstadoVacio from "@/components/estado-vacio";
import {
  COLUMNAS_INCIDENCIAS,
  SIN_FILTROS,
  TIPOS_INCIDENCIA,
  filasDelPeriodo,
  filtrarIncidencias,
  hrefIncidencias,
  leerFiltrosIncidencias,
  leerRef,
  leerVista,
  pendientesViejos,
  periodoDe,
  refPorDefecto,
  leerReporteSugerido,
  resumirIncidencias,
  resumirPorAuditor,
  resumirPorSemana,
  SIN_AUDITOR,
  type FiltrosIncidencias,
  type Incidencia,
  type ParametrosIncidencias,
  type Vista,
} from "@/lib/calidad/incidencias";
import Barras from "./barras";
import Comparacion from "./comparacion";
import Semanas from "./semanas";
import SelectorPeriodo from "./selector-periodo";
import TablaAuditores from "./tabla-auditores";
import Tarjeta from "./tarjeta";
import NuevoReporte from "./nuevo-reporte";
import Pendientes from "./pendientes";
import Secciones from "./secciones";
import TablaReportes from "./tabla-reportes";
import type { OpcionesFormulario } from "./formulario-reporte";
import { etiquetaPeriodo } from "./formato";

export const metadata = { title: "No conformidades" };

const BASE = "/calidad/incidencias";
const FILAS_EN_LISTA = 100;


// "el auditor Luis Corona, el tipo Incidencia": lo que está filtrado, en palabras.
function descripcionFiltros(f: FiltrosIncidencias): string {
  const partes: string[] = [];
  if (f.auditor) partes.push(`el auditor ${f.auditor}`);
  if (f.tipo) partes.push(`el tipo ${f.tipo}`);
  if (f.area) partes.push(`el área ${f.area}`);
  if (f.proyecto) partes.push(`el proyecto ${f.proyecto}`);
  if (f.linea) partes.push(`la línea ${f.linea === "madera" ? "Madera" : "Metal"}`);
  if (f.estado) partes.push(`el estado ${f.estado === "abierto" ? "abierto" : "cerrado"}`);
  return partes.join(", ");
}

// Cada número del resumen lleva su color: una franja arriba y un fondo suave que se aclara hacia abajo.
const TONO_NUMERO: Record<string, string> = {
  Reportes: "border-t-brand-500",
  Abiertos: "border-t-amber-400",
  Cerrados: "border-t-emerald-400",
  "Abiertos de +30 días": "border-t-rose-400",
};

// Con qué se compara el periodo que se mira (el inmediato anterior).
const VS_ANTERIOR: Record<Vista, string> = {
  dia: "el día anterior",
  semana: "la semana anterior",
  mes: "el mes anterior",
  anio: "el año anterior",
};

export default async function IncidenciasPage({ searchParams }: { searchParams: Promise<ParametrosIncidencias> }) {
  const parametros = await searchParams;
  const filtros = leerFiltrosIncidencias(parametros);
  const vista = leerVista(parametros.vista);
  const supabase = await createClient();

  // La política de lectura es solo para Calidad: sin este aviso, otro rol vería
  // "no hay no conformidades" cuando en realidad la base no le deja ver ninguna.
  const perfil = await getPerfilActual(supabase);
  if (!puedeEvaluarCalidad(perfil)) {
    return (
      <main className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
        <EstadoVacio
          titulo="Las no conformidades son solo de Calidad"
          descripcion="Pide acceso al área de Calidad si necesitas verlas."
        />
      </main>
    );
  }

  const todas = await paginarTodo<Incidencia>(
    (desde, hasta) =>
      supabase
        .from("incidencias_calidad")
        .select(COLUMNAS_INCIDENCIAS)
        .order("linea", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, hasta)
        .returns<Incidencia[]>(),
    { contexto: "las no conformidades" }
  );

  // Hoy en la hora de la empresa ("en-CA" da AAAA-MM-DD).
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const dia = leerRef(parametros.ref) ?? refPorDefecto(todas, hoy, vista);
  const periodo = periodoDe(vista, dia);

  const filtradas = filtrarIncidencias(todas, filtros);
  const delPeriodo = filasDelPeriodo(filtradas, periodo).sort(
    (a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || a.id.localeCompare(b.id)
  );
  const reportesSinFecha = filtradas.filter((i) => !i.fecha);
  const pendientes = pendientesViejos(filtradas, hoy);

  const r = resumirIncidencias(delPeriodo);
  const anteriorResumen = resumirIncidencias(filasDelPeriodo(filtradas, periodoDe(vista, periodo.anterior)));
  const auditores = resumirPorAuditor(delPeriodo);
  const semanasDelAnio = vista === "anio" ? resumirPorSemana(delPeriodo).semanas : [];

  // Valores ya registrados: sugerencias del formulario de captura y edición.
  const resumenTodo = resumirIncidencias(todas);
  const opciones: OpcionesFormulario = {
    proyectos: resumenTodo.porProyecto.map((p) => p.nombre),
    areas: [...new Set([...resumenTodo.porArea, ...resumenTodo.porAreaQueReporta].map((a) => a.nombre))].sort((a, b) =>
      a.localeCompare(b, "es")
    ),
    motivos: resumenTodo.porMotivo.map((m) => m.nombre),
    auditores: resumirPorAuditor(todas)
      .map((a) => a.nombre)
      .filter((n) => n !== SIN_AUDITOR),
  };
  const hayFiltros = Object.values(filtros).some(Boolean);

  const ir = (v: Vista, d: string) => hrefIncidencias(BASE, filtros, { vista: v, ref: d });
  const filtrarPor = (cambios: Partial<FiltrosIncidencias>) =>
    hrefIncidencias(BASE, { ...filtros, ...cambios }, { vista, ref: dia });

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">No conformidades</h1>
        <NuevoReporte opciones={opciones} hoy={hoy} sugerido={leerReporteSugerido(parametros)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorPeriodo periodo={periodo} dia={dia} hoy={hoy} hrefDe={ir} />
        {/* El Excel lleva lo mismo que se ve: el periodo y los filtros puestos. */}
        <a
          href={hrefIncidencias("/api/calidad/incidencias/excel", filtros, { vista, ref: dia })}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 max-md:min-h-11"
        >
          Descargar Excel
        </a>
      </div>

      {hayFiltros && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          Filtrando por {descripcionFiltros(filtros)}.
          <Link
            href={hrefIncidencias(BASE, SIN_FILTROS, { vista, ref: dia })}
            className="text-slate-500 underline hover:text-slate-700"
          >
            Quitar filtros
          </Link>
        </p>
      )}

      {todas.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay reportes"
          descripcion="Captura el primero con «Nuevo reporte», o carga el Excel de control con el script de importación."
        />
      ) : (
        <>
          {delPeriodo.length === 0 ? (
            <EstadoVacio
              titulo={`Sin reportes ${vista === "dia" ? "este día" : vista === "semana" ? "esta semana" : vista === "mes" ? "este mes" : "este año"}`}
              descripcion={
                hayFiltros
                  ? `No hay reportes en ${etiquetaPeriodo(periodo)} con estos filtros.`
                  : `No hay reportes en ${etiquetaPeriodo(periodo)}. Usa las flechas para ir a otro periodo.`
              }
              accion={{ href: ir(vista, refPorDefecto(todas, "9999-12-31", vista)), etiqueta: "Ir al último con reportes" }}
            />
          ) : (
            <Secciones
              secciones={[
                {
                  id: "resumen",
                  titulo: "Resumen",
                  icono: "panel",
                  contenido: (
                    <>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {[
                          ["Reportes", r.total, "text-slate-900", anteriorResumen.total, false],
                          ["Abiertos", r.abiertas, "text-amber-700", anteriorResumen.abiertas, false],
                          ["Cerrados", r.cerradas, "text-emerald-700", anteriorResumen.cerradas, true],
                          ["Abiertos de +30 días", pendientes.total, "text-rose-700", null, false],
                        ].map(([etiqueta, valor, color, antes, subirEsBueno]) => {
                          const cambio = typeof antes === "number" ? Number(valor) - antes : null;
                          const bueno = cambio !== null && (subirEsBueno ? cambio > 0 : cambio < 0);
                          const malo = cambio !== null && (subirEsBueno ? cambio < 0 : cambio > 0);
                          return (
                            <div
                              key={String(etiqueta)}
                              className={`rounded-xl border border-slate-200 border-t-4 bg-white p-4 shadow-sm ${TONO_NUMERO[String(etiqueta)] ?? ""}`}
                            >
                              <p className={`text-4xl font-bold tabular-nums ${color}`}>{valor}</p>
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{etiqueta}</p>
                              {cambio !== null && (
                                <p
                                  className={`mt-1 text-xs font-medium tabular-nums ${
                                    bueno ? "text-emerald-700" : malo ? "text-rose-700" : "text-slate-500"
                                  }`}
                                >
                                  {cambio === 0
                                    ? `Igual que ${VS_ANTERIOR[vista]}`
                                    : `${Math.abs(cambio)} ${cambio > 0 ? "más" : "menos"} que ${VS_ANTERIOR[vista]}`}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <Comparacion
                        actual={{ total: r.total, abiertas: r.abiertas, cerradas: r.cerradas }}
                        anterior={{ total: anteriorResumen.total, abiertas: anteriorResumen.abiertas, cerradas: anteriorResumen.cerradas }}
                        etiquetaActual={etiquetaPeriodo(periodo)}
                        etiquetaAnterior={etiquetaPeriodo(periodoDe(vista, periodo.anterior))}
                      />
                      {vista === "anio" && <Semanas desplegable semanas={semanasDelAnio} hrefDe={(inicio) => ir("semana", inicio)} />}
                    </>
                  ),
                },
                {
                  id: "auditores",
                  titulo: "Auditores",
                  icono: "usuarios",
                  contenido: <TablaAuditores auditores={auditores} hrefDe={(nombre) => filtrarPor({ auditor: nombre })} />,
                },
                {
                  id: "areas",
                  titulo: "Áreas",
                  icono: "equipos",
                  contenido: (
                    <div className="grid gap-6 md:grid-cols-2">
                      <Barras
                        titulo="Áreas involucradas"
                        descripcion="Dónde nace la no conformidad; un reporte cuenta en cada área que menciona"
                        filas={r.porArea}
                        maximo={10}
                        hrefDe={(n) => filtrarPor({ area: n })}
                      />
                      <Barras titulo="Área que reporta" descripcion="Quién la detecta" filas={r.porAreaQueReporta} maximo={10} />
                      <Barras
                        titulo="Nace en → lo detecta"
                        descripcion="Los cruces más repetidos entre el área donde nace y el área que la reporta"
                        filas={r.cruceAreaReporta.map((c) => ({ nombre: `${c.area} → ${c.reporta}`, total: c.total, abiertas: 0 }))}
                        maximo={10}
                      />
                    </div>
                  ),
                },
                {
                  id: "motivos",
                  titulo: "Motivos y tipos",
                  icono: "incidencias",
                  contenido: (
                    <div className="grid gap-6 md:grid-cols-2">
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
                      <Barras titulo="Motivos más repetidos" filas={r.porMotivo} maximo={10} />
                      <Barras
                        titulo="Por línea"
                        filas={[
                          { nombre: "Madera", total: r.porLinea.madera, abiertas: 0 },
                          { nombre: "Metal", total: r.porLinea.metal, abiertas: 0 },
                        ]}
                        hrefDe={(n) => filtrarPor({ linea: n === "Madera" ? "madera" : "metal" })}
                      />
                    </div>
                  ),
                },
                {
                  id: "proyectos",
                  titulo: "Proyectos",
                  icono: "pedidos",
                  contenido: (
                    <Barras
                      titulo="Proyectos con más reportes"
                      filas={r.porProyecto}
                      maximo={10}
                      hrefDe={(n) => filtrarPor({ proyecto: n })}
                    />
                  ),
                },
              ]}
            />
          )}

          {/* Los desplegables van hasta abajo, en este orden: lista, pendientes y sin fecha. */}
          {delPeriodo.length > 0 && (
            <Tarjeta
              titulo="Lista de reportes"
              descripcion={
                delPeriodo.length > FILAS_EN_LISTA
                  ? `Primeros ${FILAS_EN_LISTA} de ${delPeriodo.length}; elige un periodo más corto para ver el resto`
                  : `${delPeriodo.length} ${delPeriodo.length === 1 ? "reporte" : "reportes"} del periodo`
              }
              desplegable
            >
              <TablaReportes filas={delPeriodo.slice(0, FILAS_EN_LISTA)} opciones={opciones} hoy={hoy} />
            </Tarjeta>
          )}

          <Pendientes datos={pendientes} dias={30} opciones={opciones} hoy={hoy} />

          {reportesSinFecha.length > 0 && (
            <Tarjeta
              titulo={`Reportes sin fecha (${reportesSinFecha.length})`}
              descripcion="No aparecen en ningún día, semana, mes o año. Edítalos y ponles su fecha."
              desplegable
            >
              <TablaReportes filas={reportesSinFecha} opciones={opciones} hoy={hoy} />
            </Tarjeta>
          )}
        </>
      )}
    </main>
  );
}
