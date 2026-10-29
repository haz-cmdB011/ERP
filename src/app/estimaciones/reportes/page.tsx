import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  esMaquilador,
  getPerfilActual,
  puedeDecidirDiscrepancias,
  puedeVerPrecioSugerido,
} from "@/lib/auth/get-perfil";
import { money } from "@/lib/estimaciones/motor-precio";
import { cargarOtContraCobrado, resumirPorOt } from "@/lib/estimaciones/pm-cobrado";
import { cargarCierre } from "@/lib/estimaciones/reporte-cierres-db";
import { cargarRevisadosSinPagar } from "@/lib/estimaciones/reporte-compromiso-db";
import {
  compararConCierre,
  consultaFiltrosReporte,
  describirFiltrosReporte,
  DIAS_ATRASO_PAGO,
  filtrarPagados,
  hayFiltrosReporte,
  instantaneaDeSemana,
  leerFiltrosReporte,
  maquiladoresDe,
  resumenFechasPago,
  resumirCompromiso,
  type FiltrosReporte,
} from "@/lib/estimaciones/reporte-control";
import { hrefRegistro } from "@/lib/estimaciones/filtros-registro";
import { formatoFechaDMA } from "@/lib/resumen/entrega";
import {
  agruparEnOtros,
  armarTablero,
  cambiosNotables,
  ETIQUETA_AREA,
  UMBRAL_CAMBIO_NOTABLE,
  repartoPorArea,
  repartoPorMaquilador,
} from "@/lib/estimaciones/reporte-dashboard";
import { compararPeriodos } from "@/lib/estimaciones/reporte-comparativa";
import {
  consultaPeriodo,
  convertirPeriodo,
  etiquetaCortaPeriodo,
  interpretarPeriodo,
  MESES,
  mismoPeriodo,
  NOMBRE_TIPO_PERIODO,
  periodoDeRecibo,
  periodoPorDefecto,
  periodoVecino,
  rangoPago,
  rangoPagoDe,
  semanaDePeriodo,
  TEXTOS_PERIODO,
  tituloPeriodo,
  TIPOS_PERIODO,
  ultimosPeriodos,
  type Periodo,
} from "@/lib/estimaciones/reporte-periodos";
import {
  armarReporte,
  cargarRecibosPagadosEntre,
  claveContratista,
  etiquetaSemana,
  rangoSemana,
  semanasDelAnio,
} from "@/lib/estimaciones/reporte-semanal";
import BotonImprimir from "./boton-imprimir";
import CierreSemana from "./cierre-semana";
import {
  CambiosDivergentes,
  MetricasComparadas,
  colorMaquilador,
  FilasGrupo,
  Cambio,
  Panel,
  SeccionMaquilador,
  Tarjeta,
} from "./componentes";
import { BarrasComparadas, BarrasPorPeriodo, Pastel } from "./graficos";
import MenuDesplegable from "./menu-desplegable";
import PanelPmCobrado from "./panel-pm-cobrado";
import Pestanas from "./pestanas";
import SeccionDesplegable from "./seccion-desplegable";

export const metadata = { title: "Análisis de pagos" };

const claseSelect = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900";
const claseBotonPrimario =
  "rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-400";
const claseBotonFlecha =
  "inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50";

// Dashboard del análisis de pagos (sustituye "Estimaciones SEM nn" y "FORMATO
// MAQUILA"): recibos PAGADOS de las tres áreas, por semana, mes o año. En la
// semana N se junta lo pagado en la semana N+1; en un mes o año, lo pagado en
// ese mes o año. Arriba, las cifras del periodo; luego una comparativa contra el
// periodo anterior. Todo se reparte en pestañas para no saturar la pantalla:
// Resumen (cifras, comparativa, reparto y evolución), Maquiladores (rendimiento
// de cada uno), Recibos (la tabla) y Control (cierre de semana, compromiso y PM
// contra cobrado). RLS limita la lectura al personal de Estimaciones; el maquilador
// no entra aquí.
export default async function ReportePage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string;
    anio?: string;
    semana?: string;
    mes?: string;
    area?: string;
    maquilador?: string;
    ot?: string;
  }>;
}) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (esMaquilador(perfil)) {
    redirect("/estimaciones/mis-recibos");
  }
  const verPm = puedeVerPrecioSugerido(perfil);

  const params = await searchParams;
  const { periodo, aviso: avisoPeriodo } = interpretarPeriodo(params);
  const tipo = periodo.tipo;
  const textos = TEXTOS_PERIODO[tipo];
  const esSemana = tipo === "semana";
  const semana = semanaDePeriodo(periodo);
  const filtros = leerFiltrosReporte(params);
  const filtrado = hayFiltrosReporte(filtros);

  // El periodo y los filtros viajan en la URL: al cambiar de periodo o descargar
  // el Excel se conservan.
  const hrefPeriodo = (p: Periodo, f: FiltrosReporte = filtros) =>
    `/estimaciones/reportes?${consultaPeriodo(p)}${consultaFiltrosReporte(f)}`;
  const pago = rangoPago(periodo);

  // Historial: los últimos periodos hasta la vista, en una sola consulta. Si una
  // lectura falla se lanza el error (error.tsx con "Reintentar"): nunca se
  // muestran totales parciales como si fueran completos.
  const periodosHistorial = ultimosPeriodos(periodo);
  const rangoHistorial = rangoPagoDe(periodosHistorial);
  const [recibosHistorialTodos, pm, porPagar, estadoCierre] = await Promise.all([
    cargarRecibosPagadosEntre(supabase, rangoHistorial.desde, rangoHistorial.hasta),
    verPm ? cargarOtContraCobrado(supabase) : Promise.resolve(null),
    cargarRevisadosSinPagar(supabase),
    esSemana ? cargarCierre(supabase, semana) : Promise.resolve({ disponible: false, cierre: null }),
  ]);

  const esDelPeriodo = (r: { pagadoEn: string }) =>
    mismoPeriodo(periodoDeRecibo(r.pagadoEn, tipo), periodo);
  const recibosHistorial = filtrarPagados(recibosHistorialTodos, filtros);
  const tablero = armarTablero(recibosHistorial, periodo);
  const recibos = recibosHistorial.filter(esDelPeriodo);
  const reporte = armarReporte(recibos);
  const fechasPago = resumenFechasPago(recibos);
  const compromiso = resumirCompromiso(porPagar);
  const notables = cambiosNotables(tablero.maquiladores);
  const comparativa = compararPeriodos(recibosHistorial, periodo);
  const opcionesMaquilador = maquiladoresDe(recibosHistorialTodos);
  // El cierre guarda la semana COMPLETA: los filtros no deben parecer cambios.
  const instantanea = instantaneaDeSemana(recibosHistorialTodos.filter(esDelPeriodo));
  const cierre = estadoCierre.cierre;
  const diferenciaCierre = cierre ? compararConCierre(cierre, instantanea) : null;
  const gruposPorClave = new Map(reporte.grupos.map((g) => [claveContratista(g.contratista), g]));

  const porMaquilador = agruparEnOtros(repartoPorMaquilador(recibos), 8);
  const porArea = repartoPorArea(recibos);
  // Con error no se enseña un avance parcial: el panel solo muestra el aviso.
  const resumenesPm = pm ? (pm.error ? [] : resumirPorOt(pm.filas)) : null;

  const anterior = periodoVecino(periodo, -1);
  const siguiente = periodoVecino(periodo, 1);
  const porDefecto = periodoPorDefecto(tipo);
  const esPorDefecto = mismoPeriodo(periodo, porDefecto);
  const indiceVista = tablero.periodos.length - 1;
  const nHistorial = tablero.periodos.length;
  const etiquetaActual = etiquetaCortaPeriodo(periodo);
  const etiquetaAnterior = etiquetaCortaPeriodo(anterior);

  const cambiosMaquilador = comparativa.porMaquilador.filter((f) => f.estado !== "igual");
  const trabajo = esSemana ? rangoSemana(semana) : null;
  const sinPagos = reporte.numRecibos === 0;
  const hayEvolucion = tablero.totales.some((t) => t.importe > 0);
  const hayCambiosCierre = Boolean(cierre && diferenciaCierre && !diferenciaCierre.sinCambios);
  const consultaExcel = `anio=${semana.anio}&semana=${semana.semana}${consultaFiltrosReporte(filtros)}`;

  const chipsFiltro: { texto: string; quitar: FiltrosReporte }[] = [
    ...(filtros.area ? [{ texto: `Área: ${ETIQUETA_AREA[filtros.area]}`, quitar: { ...filtros, area: null } }] : []),
    ...(filtros.maquilador
      ? [{ texto: `Maquilador: ${filtros.maquilador}`, quitar: { ...filtros, maquilador: "" } }]
      : []),
    ...(filtros.ot ? [{ texto: `O.T.: ${filtros.ot}`, quitar: { ...filtros, ot: "" } }] : []),
  ];

  const camposFiltro = (
    <>
      {filtros.area && <input type="hidden" name="area" value={filtros.area} />}
      {filtros.maquilador && <input type="hidden" name="maquilador" value={filtros.maquilador} />}
      {filtros.ot && <input type="hidden" name="ot" value={filtros.ot} />}
    </>
  );

  return (
    <main className="graficas mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Análisis de pagos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pagado del {formatoFechaDMA(pago.desde)} al {formatoFechaDMA(pago.hasta)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <BotonImprimir />
          {esSemana && reporte.numRecibos > 0 && (
            <a
              href={`/api/estimaciones/reporte-semanal?${consultaExcel}`}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Descargar Excel{filtrado ? " (filtrado)" : ""}
            </a>
          )}
        </div>
      </div>

      {/* Barra de control: tipo de periodo, navegación y filtros. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 print:hidden">
        <nav
          aria-label="Tipo de reporte"
          className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm"
        >
          {TIPOS_PERIODO.map((t) => (
            <Link
              key={t}
              href={hrefPeriodo(convertirPeriodo(periodo, t))}
              aria-current={t === tipo ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                t === tipo
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {NOMBRE_TIPO_PERIODO[t]}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link href={hrefPeriodo(anterior)} className={claseBotonFlecha} aria-label={`Ir a ${tituloPeriodo(anterior)}`}>
            ←
          </Link>
          <MenuDesplegable etiqueta={<span className="font-semibold text-slate-900">{tituloPeriodo(periodo)}</span>}>
            <form action="/estimaciones/reportes" className="flex flex-col gap-3">
              <input type="hidden" name="periodo" value={tipo} />
              {camposFiltro}
              <div className="flex flex-wrap items-end gap-2">
                {esSemana && (
                  <label className="flex flex-col gap-0.5 text-xs text-slate-500">
                    Semana
                    <select name="semana" defaultValue={periodo.numero} className={claseSelect}>
                      {Array.from({ length: semanasDelAnio(periodo.anio) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          Semana {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {tipo === "mes" && (
                  <label className="flex flex-col gap-0.5 text-xs text-slate-500">
                    Mes
                    <select name="mes" defaultValue={periodo.numero} className={claseSelect}>
                      {MESES.map((nombre, i) => (
                        <option key={nombre} value={i + 1}>
                          {nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex flex-col gap-0.5 text-xs text-slate-500">
                  Año
                  <input
                    type="number"
                    name="anio"
                    defaultValue={periodo.anio}
                    min={2000}
                    max={2100}
                    className={`${claseSelect} w-24`}
                  />
                </label>
                <button type="submit" className={claseBotonPrimario}>
                  Ver
                </button>
              </div>
              {trabajo && (
                <p className="text-xs text-slate-500">
                  Trabajo del {formatoFechaDMA(trabajo.desde)} al {formatoFechaDMA(trabajo.hasta)}; se paga
                  la semana siguiente.
                </p>
              )}
              <div className="flex flex-col gap-1 border-t border-slate-100 pt-3 text-sm">
                {!esPorDefecto && (
                  <Link href={hrefPeriodo(porDefecto)} className="font-medium text-brand-700 hover:underline">
                    {esSemana
                      ? `Ir a la semana por pagar (${porDefecto.numero})`
                      : `Ir a ${tipo === "mes" ? "este mes" : "este año"}`}
                  </Link>
                )}
                {resumenesPm && (
                  <a href="#pm-cobrado" className="font-medium text-brand-700 hover:underline">
                    Ir a PM contra cobrado ↓
                  </a>
                )}
              </div>
            </form>
          </MenuDesplegable>
          <Link href={hrefPeriodo(siguiente)} className={claseBotonFlecha} aria-label={`Ir a ${tituloPeriodo(siguiente)}`}>
            →
          </Link>
        </div>

        <div className="ml-auto">
          <MenuDesplegable
            alinear="derecha"
            etiqueta={
              <>
                Filtros
                {chipsFiltro.length > 0 && (
                  <span className="rounded-full bg-brand-500 px-1.5 text-xs font-semibold text-on-brand">
                    {chipsFiltro.length}
                  </span>
                )}
              </>
            }
          >
            <form action="/estimaciones/reportes" className="flex flex-col gap-3" aria-label="Filtros del reporte">
              <input type="hidden" name="periodo" value={tipo} />
              <input type="hidden" name="anio" value={periodo.anio} />
              {esSemana && <input type="hidden" name="semana" value={periodo.numero} />}
              {tipo === "mes" && <input type="hidden" name="mes" value={periodo.numero} />}
              <label className="flex flex-col gap-0.5 text-xs text-slate-500">
                Área
                <select name="area" defaultValue={filtros.area ?? ""} className={claseSelect}>
                  <option value="">Todas</option>
                  {(Object.keys(ETIQUETA_AREA) as (keyof typeof ETIQUETA_AREA)[]).map((t) => (
                    <option key={t} value={t}>
                      {ETIQUETA_AREA[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-slate-500">
                Maquilador
                <select name="maquilador" defaultValue={filtros.maquilador} className={claseSelect}>
                  <option value="">Todos</option>
                  {filtros.maquilador &&
                    !opcionesMaquilador.some((n) => claveContratista(n) === claveContratista(filtros.maquilador)) && (
                      <option value={filtros.maquilador}>{filtros.maquilador}</option>
                    )}
                  {opcionesMaquilador.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-slate-500">
                O.T.
                <input
                  type="search"
                  name="ot"
                  defaultValue={filtros.ot}
                  placeholder="193-24"
                  className={claseSelect}
                />
              </label>
              <div className="flex items-center gap-3">
                <button type="submit" className={claseBotonPrimario}>
                  Aplicar filtros
                </button>
                {filtrado && (
                  <Link
                    href={hrefPeriodo(periodo, { area: null, maquilador: "", ot: "" })}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    Quitar filtros
                  </Link>
                )}
              </div>
            </form>
          </MenuDesplegable>
        </div>
      </div>

      {filtrado && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Viendo solo:</span>
            {chipsFiltro.map((c) => (
              <Link
                key={c.texto}
                href={hrefPeriodo(periodo, c.quitar)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium ring-1 ring-sky-200 hover:bg-sky-100"
                title="Quitar este filtro"
              >
                {c.texto}
                <span aria-hidden="true">✕</span>
                <span className="sr-only">Quitar este filtro</span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-sky-800">
            Las cifras, las gráficas y el Excel cubren únicamente {describirFiltrosReporte(filtros, ETIQUETA_AREA)}
            {esSemana
              ? "; el cierre de semana y el compromiso siguen siendo de toda la semana."
              : "; el compromiso sigue siendo de todo."}
          </p>
        </div>
      )}

      {avisoPeriodo && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {avisoPeriodo}
        </p>
      )}

      {hayCambiosCierre && (
        <a
          href="#control"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 hover:bg-amber-100 print:hidden"
        >
          El reporte cambió desde que se cerró la semana. Ver el detalle en Control →
        </a>
      )}

      <Pestanas
        pestanas={[
          {
            id: "resumen",
            etiqueta: "Resumen",
            contenido: (
              <>
                {sinPagos ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                    No hay recibos pagados para {textos.este}.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Tarjeta
                      titulo="Total pagado"
                      valor={money(tablero.importe)}
                      pie={
                        tablero.cambioTotalVsAnterior != null ? (
                          <Cambio valor={tablero.cambioTotalVsAnterior} sufijo={textos.vsAnterior} />
                        ) : undefined
                      }
                    />
                    <Tarjeta
                      titulo="Recibos pagados"
                      valor={String(tablero.recibos)}
                      pie={
                        comparativa.hayBase ? (
                          <Cambio valor={comparativa.recibos.cambio} sufijo={textos.vsAnterior} />
                        ) : undefined
                      }
                    />
                    <Tarjeta
                      titulo="Maquiladores con pago"
                      valor={String(tablero.activos)}
                      pie={
                        comparativa.hayBase ? (
                          <Cambio valor={comparativa.activos.cambio} sufijo={textos.vsAnterior} />
                        ) : undefined
                      }
                    />
                    <Tarjeta
                      titulo="Recibo promedio"
                      valor={tablero.ticketPromedio == null ? "—" : money(tablero.ticketPromedio)}
                      pie={
                        comparativa.hayBase ? (
                          <Cambio valor={comparativa.ticket.cambio} sufijo={textos.vsAnterior} />
                        ) : undefined
                      }
                    />
                  </div>
                )}

                {(hayEvolucion || comparativa.hayBase) && (
                  <div className="grid items-stretch gap-4 lg:grid-cols-2">
                    {hayEvolucion && (
                      <Panel titulo={`Últimos ${nHistorial} ${textos.plural}`}>
                        <BarrasPorPeriodo
                          titulo={`Barras del total pagado por ${textos.singular}`}
                          resaltar={indiceVista}
                          puntos={tablero.totales.map((t) => ({
                            etiqueta: etiquetaCortaPeriodo(t.periodo),
                            importe: t.importe,
                            detalle: `${t.recibos} recibo${t.recibos === 1 ? "" : "s"}`,
                          }))}
                        />
                      </Panel>
                    )}
                    {comparativa.hayBase && (
                      <Panel titulo={`Por área frente a ${textos.anterior}`}>
                        <BarrasComparadas
                          titulo={`Barras del importe pagado por área: ${tituloPeriodo(anterior)} contra ${tituloPeriodo(periodo)}`}
                          etiquetaActual={etiquetaActual}
                          etiquetaAnterior={etiquetaAnterior}
                          grupos={comparativa.porArea.map((f) => ({
                            etiqueta: f.etiqueta,
                            actual: f.actual,
                            anterior: f.anterior,
                          }))}
                        />
                      </Panel>
                    )}
                  </div>
                )}

                {(comparativa.hayBase || !sinPagos) && (
                  <SeccionDesplegable id="mas-detalle" titulo="Más detalle">
                    {comparativa.hayBase && (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Cifras clave frente a {textos.anterior}
                        </h3>
                        <MetricasComparadas
                          etiquetaActual={etiquetaActual}
                          etiquetaAnterior={etiquetaAnterior}
                          filas={[
                            { nombre: "Total pagado", m: comparativa.total, dinero: true },
                            { nombre: "Recibos pagados", m: comparativa.recibos },
                            { nombre: "Maquiladores con pago", m: comparativa.activos },
                            { nombre: "Recibo promedio", m: comparativa.ticket, dinero: true },
                            { nombre: "O.T. con pago", m: comparativa.ots },
                          ]}
                        />
                      </div>
                    )}

                    {comparativa.hallazgos.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Lo más relevante
                        </h3>
                        <ul className="flex flex-col gap-1.5 text-sm text-slate-700">
                          {comparativa.hallazgos.map((h) => (
                            <li key={h} className="flex gap-2">
                              <span aria-hidden="true" className="text-slate-500">
                                •
                              </span>
                              <span>{h}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!sinPagos && (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Reparto de lo pagado
                        </h3>
                        <div className="grid items-stretch gap-4 lg:grid-cols-2">
                          <Panel titulo="Por maquilador">
                            <Pastel
                              apilado
                              porciones={porMaquilador}
                              titulo="Gráfica de pastel del importe pagado a cada maquilador"
                              centro={money(reporte.importe)}
                              enlace={(p) =>
                                p.etiqueta === "Otros" || p.etiqueta === "Sin contratista"
                                  ? null
                                  : hrefRegistro({ estado: "pagado", contratista: p.etiqueta })
                              }
                            />
                          </Panel>
                          <Panel titulo="Por área">
                            <Pastel
                              apilado
                              porciones={porArea}
                              titulo="Gráfica de pastel del importe pagado por área"
                              centro={money(reporte.importe)}
                              enlace={(p) => {
                                const t = (Object.keys(ETIQUETA_AREA) as (keyof typeof ETIQUETA_AREA)[]).find(
                                  (k) => ETIQUETA_AREA[k] === p.etiqueta
                                );
                                return t ? hrefRegistro({ estado: "pagado", tipo: t }) : null;
                              }}
                            />
                          </Panel>
                        </div>
                      </div>
                    )}

                    {(tablero.cambioTotalVsPromedio != null || notables.length > 0) && (
                      <div className="flex flex-col gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Contra el promedio de los {nHistorial - 1} {textos.plural} anteriores
                        </h3>
                        {tablero.cambioTotalVsPromedio != null && (
                          <Cambio valor={tablero.cambioTotalVsPromedio} sufijo="en el total pagado" />
                        )}
                        {notables.length > 0 && (
                          <p className="text-xs text-slate-500">
                            Maquiladores con {UMBRAL_CAMBIO_NOTABLE}% o más de diferencia contra su promedio:
                          </p>
                        )}
                        {notables.length > 0 && (
                          <ul className="flex flex-wrap gap-2 text-xs">
                            {notables.map((n) => (
                              <li
                                key={n.contratista}
                                className={`rounded-full px-2.5 py-1 font-medium ring-1 ${
                                  n.cambio > 0
                                    ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                                    : "bg-rose-50 text-rose-800 ring-rose-200"
                                }`}
                              >
                                {n.contratista}: {n.cambio > 0 ? "▲ +" : "▼ "}
                                {n.cambio.toLocaleString("es-MX", { maximumFractionDigits: 1 })}% ({money(n.importe)})
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </SeccionDesplegable>
                )}
              </>
            ),
          },
          {
            id: "maquiladores",
            etiqueta: "Maquiladores",
            contenido:
              tablero.maquiladores.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  No hay pagos a maquiladores en los últimos {nHistorial} {textos.plural}.
                </p>
              ) : (
                <>
                  {comparativa.hayBase && cambiosMaquilador.length > 0 && (
                    <Panel titulo={`Cambios frente a ${textos.anterior}`}>
                      <CambiosDivergentes filas={cambiosMaquilador.slice(0, 8)} />
                      {cambiosMaquilador.length > 8 && (
                        <details className="group rounded-lg border border-slate-200">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                            Ver los {comparativa.porMaquilador.length} maquiladores
                            <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-180">
                              ▾
                            </span>
                          </summary>
                          <div className="border-t border-slate-200 p-3">
                            <CambiosDivergentes filas={comparativa.porMaquilador} />
                          </div>
                        </details>
                      )}
                    </Panel>
                  )}

                  <div className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold text-slate-900">Rendimiento de cada uno</h2>
                    <p className="text-xs text-slate-500">
                      Últimos {nHistorial} {textos.plural}. Despliega uno para ver su detalle y sus recibos.
                    </p>
                    {tablero.maquiladores.map((m) => (
                      <SeccionMaquilador
                        key={m.contratista}
                        m={m}
                        color={colorMaquilador(m.contratista, porMaquilador)}
                        grupo={gruposPorClave.get(claveContratista(m.contratista))}
                        indiceVista={indiceVista}
                        textos={textos}
                      />
                    ))}
                  </div>
                </>
              ),
          },
          {
            id: "recibos",
            etiqueta: "Recibos",
            contenido:
              reporte.numRecibos === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  No hay recibos pagados para {textos.este}.
                </p>
              ) : (
                <>
                  {fechasPago.length > 0 && fechasPago.length <= 8 && (
                    <p className="text-xs text-slate-500">
                      Pagado en {fechasPago.length === 1 ? "la fecha" : `${fechasPago.length} fechas`}:{" "}
                      {fechasPago
                        .map(
                          (f) =>
                            `${formatoFechaDMA(f.fecha)} (${f.recibos} recibo${f.recibos === 1 ? "" : "s"}, ${money(f.importe)})`
                        )
                        .join(" · ")}
                    </p>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3">Maquilador</th>
                          <th className="px-4 py-3">Área</th>
                          <th className="px-4 py-3">Folio</th>
                          <th className="px-4 py-3">OT</th>
                          <th className="px-4 py-3 text-right">Importe</th>
                          <th className="px-4 py-3 text-right">Seguro social</th>
                          <th className="px-4 py-3 text-right">Total a pagar</th>
                        </tr>
                      </thead>
                      {reporte.grupos.map((g) => (
                        <tbody key={g.contratista} className="border-t border-slate-200">
                          <FilasGrupo grupo={g} mostrarNombre />
                          {g.filas.length > 1 && (
                            <tr className="bg-slate-50/60 text-xs">
                              <td colSpan={4} className="px-4 py-2 text-right text-slate-500">
                                Subtotal {g.contratista}
                              </td>
                              <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700">
                                {money(g.importe)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-500">
                                {g.seguroSocial == null ? "—" : money(g.seguroSocial)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums text-slate-900">
                                {money(g.totalPagar)}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      ))}
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                          <td colSpan={4} className="px-4 py-3 text-right text-slate-700">
                            Total {esSemana ? etiquetaSemana(semana).toLowerCase() : tituloPeriodo(periodo).toLowerCase()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                            {money(reporte.importe)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                            {money(reporte.seguroSocial)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                            {money(reporte.totalPagar)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500">
                    Aún no hay datos de IMSS en el ERP: no se descuenta seguro social y el total a pagar es
                    igual al importe.
                  </p>
                </>
              ),
          },
          {
            id: "control",
            etiqueta: "Control",
            aviso: hayCambiosCierre || compromiso.atrasados > 0,
            contenido: (
              <>
                {esSemana && estadoCierre.disponible && (
                  <CierreSemana
                    semana={semana}
                    actual={instantanea}
                    cierre={cierre}
                    diferencia={diferenciaCierre}
                    puedeCerrar={puedeDecidirDiscrepancias(perfil)}
                  />
                )}

                <SeccionDesplegable
                  id="compromiso"
                  abierta
                  titulo="Revisado y sin pagar"
                  descripcion="Recibos que ya se revisaron y esperan su pago."
                  resumen={
                    compromiso.numRecibos === 0
                      ? "Nada pendiente"
                      : `${compromiso.numRecibos} · ${money(compromiso.importe)}`
                  }
                >
                  {compromiso.numRecibos === 0 ? (
                    <p className="text-sm text-slate-500">No hay recibos revisados esperando pago.</p>
                  ) : (
                    <div className="flex flex-col gap-1 text-sm text-slate-700">
                      <p>
                        <span className="font-semibold text-slate-900">
                          {compromiso.numRecibos} recibo{compromiso.numRecibos === 1 ? "" : "s"}
                        </span>{" "}
                        por <span className="font-semibold text-slate-900">{money(compromiso.importe)}</span> ·{" "}
                        {compromiso.porArea
                          .map((a) => `${ETIQUETA_AREA[a.tipo]}: ${a.recibos} (${money(a.importe)})`)
                          .join(" · ")}
                      </p>
                      {compromiso.masAntiguo && (
                        <p
                          className={`text-xs ${compromiso.atrasados > 0 ? "font-medium text-amber-800" : "text-slate-500"}`}
                        >
                          El más antiguo: {ETIQUETA_AREA[compromiso.masAntiguo.tipo]} {compromiso.masAntiguo.folio}{" "}
                          de {compromiso.masAntiguo.contratista}, revisado hace {compromiso.masAntiguo.dias}{" "}
                          día{compromiso.masAntiguo.dias === 1 ? "" : "s"}.
                          {compromiso.atrasados > 0 &&
                            ` ${compromiso.atrasados} llevan ${DIAS_ATRASO_PAGO} días o más sin pagarse.`}
                        </p>
                      )}
                    </div>
                  )}
                </SeccionDesplegable>

                {resumenesPm && (
                  <SeccionDesplegable
                    id="pm-cobrado"
                    titulo="PM contra cobrado"
                    descripcion="Lo declarado por Planeación en cada O.T. contra lo capturado en recibos vigentes."
                    resumen={pm?.error ? "No se pudo leer" : `${resumenesPm.length} O.T.`}
                  >
                    <PanelPmCobrado
                      resumenes={resumenesPm}
                      baseCobro={pm?.base ?? "calidad"}
                      error={pm?.error ?? null}
                    />
                  </SeccionDesplegable>
                )}
              </>
            ),
          },
        ]}
      />
    </main>
  );
}
