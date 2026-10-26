import Link from "next/link";
import PestanasSeccion from "@/app/calidad/pestanas-seccion";
import { createClient } from "@/lib/supabase/server";
import { paginarTodo } from "@/lib/supabase/paginar";
import { getPerfilActual, puedeEvaluarCalidad } from "@/lib/auth/get-perfil";
import EstadoVacio from "@/components/estado-vacio";
import {
  COLUMNAS_INCIDENCIAS,
  SIN_FILTROS,
  TIPOS_INCIDENCIA,
  desglosarPeriodo,
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
  semanaDe,
  SIN_AUDITOR,
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
import Tarjeta from "./tarjeta";
import NuevoReporte from "./nuevo-reporte";
import Pendientes from "./pendientes";
import TablaReportes from "./tabla-reportes";
import type { OpcionesFormulario } from "./formulario-reporte";
import { diaConSemana, etiquetaPeriodo, nombreMes, rangoCorto } from "./formato";

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
  const auditores = resumirPorAuditor(delPeriodo);
  const desglose = desglosarPeriodo(delPeriodo, periodo);
  const porEtiqueta = new Map(desglose.map((s) => [etiquetaSubperiodo(s), s]));
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
      <PestanasSeccion seccion="revision" />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">No conformidades</h1>
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
            <>
              <TablaAuditores auditores={auditores} hrefDe={(nombre) => filtrarPor({ auditor: nombre })} />
              {vista !== "dia" && (
                <Barras
                  titulo={TITULO_DESGLOSE[vista]}
                  descripcion={`Cómo se reparten los ${r.total} reportes ${DE_QUE[vista]}`}
                  filas={desglose.map((s) => ({ nombre: etiquetaSubperiodo(s), total: s.total, abiertas: s.abiertas }))}
                  maximo={40}
                  desplegable
                  hrefDe={(nombre) => {
                    const s = porEtiqueta.get(nombre);
                    return s ? ir(s.vista, s.ref) : ir(vista, dia);
                  }}
                />
              )}

              {vista === "anio" && <Semanas desplegable semanas={semanasDelAnio} hrefDe={(inicio) => ir("semana", inicio)} />}

              <Tarjeta
                titulo={`Detalle de ${etiquetaPeriodo(periodo)}`}
                descripcion="Tipo, categoría, áreas, motivos y proyectos del periodo"
                desplegable
                abierto
              >
                <div className="grid gap-6 md:grid-cols-2">
                  <Barras plana
                    titulo="Por tipo de reporte"
                    filas={r.porTipo}
                    hrefDe={(n) => filtrarPor({ tipo: TIPOS_INCIDENCIA.find((t) => t === n) ?? null })}
                  />
                  <Barras plana
                    titulo="Por categoría del motivo"
                    descripcion="Agrupación de los motivos escritos a mano"
                    filas={r.porCategoria}
                    maximo={9}
                  />
                  <Barras plana
                    titulo="Áreas involucradas"
                    descripcion="Dónde nace la no conformidad; un reporte cuenta en cada área que menciona"
                    filas={r.porArea}
                    maximo={10}
                    hrefDe={(n) => filtrarPor({ area: n })}
                  />
                  <Barras plana
                    titulo="Área que reporta"
                    descripcion="Quién la detecta"
                    filas={r.porAreaQueReporta}
                    maximo={10}
                  />
                  <Barras plana
 titulo="Motivos más repetidos" filas={r.porMotivo} maximo={10} />
                  <Barras plana
                    titulo="Proyectos con más reportes"
                    filas={r.porProyecto}
                    maximo={10}
                    hrefDe={(n) => filtrarPor({ proyecto: n })}
                  />
                </div>
              </Tarjeta>

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
            </>
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
