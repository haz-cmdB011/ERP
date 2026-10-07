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
  interpretarSemana,
  leerFiltrosReporte,
  maquiladoresDe,
  resumenFechasPago,
  resumirCompromiso,
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
  semanaDeReporteDe,
  SEMANAS_HISTORIAL,
  semanasDePagoDelHistorial,
} from "@/lib/estimaciones/reporte-dashboard";
import {
  armarReporte,
  cargarRecibosPagadosEntre,
  claveContratista,
  etiquetaSemana,
  rangoSemana,
  semanaDePago,
  semanaPorReportar,
  semanasDelAnio,
  semanaVecina,
  type Semana,
} from "@/lib/estimaciones/reporte-semanal";
import BotonImprimir from "./boton-imprimir";
import CierreSemana from "./cierre-semana";
import {
  colorMaquilador,
  FilasGrupo,
  Cambio,
  Panel,
  SeccionMaquilador,
  Tarjeta,
  etiquetaCorta,
} from "./componentes";
import { BarrasSemanales, Pastel } from "./graficos";
import PanelPmCobrado from "./panel-pm-cobrado";
import SeccionDesplegable from "./seccion-desplegable";

export const metadata = { title: "Reporte semanal" };


// Dashboard del reporte semanal (sustituye "Estimaciones SEM nn" y "FORMATO
// MAQUILA"): recibos PAGADOS de las tres áreas. La semana N junta lo pagado en
// la semana N+1. Arriba, las cifras y gráficas de la semana; luego una sección
// por maquilador con su rendimiento en las últimas semanas; el PM contra
// cobrado; y la tabla de recibos, en un desplegable. RLS limita la lectura al
// personal de Estimaciones; el maquilador no entra aquí.
export default async function ReporteSemanalPage({
  searchParams,
}: {
  searchParams: Promise<{
    anio?: string;
    semana?: string;
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
  const { semana, aviso: avisoSemana } = interpretarSemana(params.anio, params.semana);
  const filtros = leerFiltrosReporte(params);
  const filtrado = hayFiltrosReporte(filtros);
  // Los filtros viajan en la URL: al cambiar de semana o descargar el Excel se conservan.
  const consulta = (s: Semana) => `anio=${s.anio}&semana=${s.semana}${consultaFiltrosReporte(filtros)}`;
  const hrefSemana = (s: Semana) => `/estimaciones/reportes?${consulta(s)}`;
  const trabajo = rangoSemana(semana);
  const pago = rangoSemana(semanaDePago(semana));

  // Historial: las últimas semanas hasta la vista, en una sola consulta. Si una
  // lectura falla se lanza el error (error.tsx con "Reintentar"): nunca se
  // muestran totales parciales como si fueran completos.
  const tableroVacio = armarTablero([], semana);
  const { primera, ultima } = semanasDePagoDelHistorial(tableroVacio.semanas);
  const [recibosHistorialTodos, pm, porPagar, estadoCierre] = await Promise.all([
    cargarRecibosPagadosEntre(supabase, rangoSemana(primera).desde, rangoSemana(ultima).hasta),
    verPm ? cargarOtContraCobrado(supabase) : Promise.resolve(null),
    cargarRevisadosSinPagar(supabase),
    cargarCierre(supabase, semana),
  ]);

  const esDeLaSemana = (r: { pagadoEn: string }) => {
    const s = semanaDeReporteDe(r.pagadoEn);
    return s.anio === semana.anio && s.semana === semana.semana;
  };
  const recibosHistorial = filtrarPagados(recibosHistorialTodos, filtros);
  const tablero = armarTablero(recibosHistorial, semana);
  const recibos = recibosHistorial.filter(esDeLaSemana);
  const reporte = armarReporte(recibos);
  const fechasPago = resumenFechasPago(recibos);
  const compromiso = resumirCompromiso(porPagar);
  const notables = cambiosNotables(tablero.maquiladores);
  const opcionesMaquilador = maquiladoresDe(recibosHistorialTodos);
  // El cierre guarda la semana COMPLETA: los filtros no deben parecer cambios.
  const instantanea = instantaneaDeSemana(recibosHistorialTodos.filter(esDeLaSemana));
  const cierre = estadoCierre.cierre;
  const diferenciaCierre = cierre ? compararConCierre(cierre, instantanea) : null;
  const gruposPorClave = new Map(reporte.grupos.map((g) => [claveContratista(g.contratista), g]));

  const porMaquilador = agruparEnOtros(repartoPorMaquilador(recibos), 8);
  const porArea = repartoPorArea(recibos);
  // Con error no se enseña un avance parcial: el panel solo muestra el aviso.
  const resumenesPm = pm ? (pm.error ? [] : resumirPorOt(pm.filas)) : null;

  const anterior = semanaVecina(semana, -1);
  const siguiente = semanaVecina(semana, 1);
  const porReportar = semanaPorReportar();
  const totalSemanas = semanasDelAnio(semana.anio);
  const indiceVista = tablero.semanas.length - 1;

  return (
    <main className="graficas mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Reporte semanal · Semana {semana.semana} de {semana.anio}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Semana del {formatoFechaDMA(trabajo.desde)} al {formatoFechaDMA(trabajo.hasta)}. Recibos
            pagados del {formatoFechaDMA(pago.desde)} al {formatoFechaDMA(pago.hasta)} en Acabados,
            Armado y Electrificación.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <BotonImprimir />
          {reporte.numRecibos > 0 && (
            <a
              href={`/api/estimaciones/reporte-semanal?${consulta(semana)}`}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Descargar Excel{filtrado ? " (filtrado)" : ""}
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
        <Link
          href={hrefSemana(anterior)}
          className="rounded bg-white px-3 py-1 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          ← Semana {anterior.semana}
        </Link>
        <form action="/estimaciones/reportes" className="flex items-center gap-2">
          {filtros.area && <input type="hidden" name="area" value={filtros.area} />}
          {filtros.maquilador && <input type="hidden" name="maquilador" value={filtros.maquilador} />}
          {filtros.ot && <input type="hidden" name="ot" value={filtros.ot} />}
          <select
            name="semana"
            defaultValue={semana.semana}
            className="rounded border border-slate-200 bg-white px-2 py-1"
            aria-label="Semana"
          >
            {Array.from({ length: totalSemanas }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Semana {n}
              </option>
            ))}
          </select>
          <input
            type="number"
            name="anio"
            defaultValue={semana.anio}
            min={2000}
            max={2100}
            className="w-24 rounded border border-slate-200 bg-white px-2 py-1"
            aria-label="Año"
          />
          <button
            type="submit"
            className="rounded bg-brand-500 px-3 py-1 font-semibold text-on-brand hover:bg-brand-400"
          >
            Ver
          </button>
        </form>
        <Link
          href={hrefSemana(siguiente)}
          className="rounded bg-white px-3 py-1 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Semana {siguiente.semana} →
        </Link>
        {(semana.anio !== porReportar.anio || semana.semana !== porReportar.semana) && (
          <Link
            href={hrefSemana(porReportar)}
            className="px-2 font-medium text-brand-700 hover:underline"
          >
            Semana por pagar ({porReportar.semana})
          </Link>
        )}
        <a href="#pm-cobrado" className="px-2 font-medium text-brand-700 hover:underline">
          PM contra cobrado ↓
        </a>
      </div>

      <form
        action="/estimaciones/reportes"
        className="flex flex-wrap items-end gap-2 text-sm print:hidden"
        aria-label="Filtros del reporte"
      >
        <input type="hidden" name="anio" value={semana.anio} />
        <input type="hidden" name="semana" value={semana.semana} />
        <label className="flex flex-col gap-0.5 text-xs text-slate-500">
          Área
          <select
            name="area"
            defaultValue={filtros.area ?? ""}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
          >
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
          <select
            name="maquilador"
            defaultValue={filtros.maquilador}
            className="max-w-56 rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
          >
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
            className="w-28 rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-brand-500 px-3 py-1 font-semibold text-on-brand hover:bg-brand-400"
        >
          Filtrar
        </button>
        {filtrado && (
          <Link
            href={`/estimaciones/reportes?anio=${semana.anio}&semana=${semana.semana}`}
            className="px-2 py-1 font-medium text-brand-700 hover:underline"
          >
            Quitar filtros
          </Link>
        )}
      </form>

      {filtrado && (
        <p
          role="status"
          className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"
        >
          Viendo solo: {describirFiltrosReporte(filtros, ETIQUETA_AREA)}. Las cifras, las gráficas y el
          Excel cubren únicamente esa parte; el cierre de semana y el compromiso siguen siendo de toda la
          semana.
        </p>
      )}

      {avisoSemana && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {avisoSemana}
        </p>
      )}

      {estadoCierre.disponible && (
        <CierreSemana
          semana={semana}
          actual={instantanea}
          cierre={cierre}
          diferencia={diferenciaCierre}
          puedeCerrar={puedeDecidirDiscrepancias(perfil)}
        />
      )}

      {/* KPI de la semana */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta
          titulo="Total pagado"
          valor={money(tablero.importeSemana)}
          pie={
            <span className="flex flex-col gap-0.5">
              <Cambio valor={tablero.cambioTotalVsAnterior} sufijo="vs semana anterior" />
              <Cambio
                valor={tablero.cambioTotalVsPromedio}
                sufijo={`vs promedio de ${SEMANAS_HISTORIAL - 1} semanas`}
              />
            </span>
          }
        />
        <Tarjeta
          titulo="Recibos pagados"
          valor={String(tablero.recibosSemana)}
          pie={
            <span className="text-xs text-slate-500">
              en {tablero.otsSemana} O.T.
            </span>
          }
        />
        <Tarjeta
          titulo="Maquiladores con pago"
          valor={String(tablero.activosSemana)}
          pie={
            <span className="text-xs text-slate-500">
              de {tablero.maquiladores.length} en las últimas {SEMANAS_HISTORIAL} semanas
            </span>
          }
        />
        <Tarjeta
          titulo="Recibo promedio"
          valor={tablero.ticketPromedio == null ? "—" : money(tablero.ticketPromedio)}
          pie={<span className="text-xs text-slate-500">importe por recibo</span>}
        />
      </div>

      {fechasPago.length > 0 && (
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

      <section
        aria-label="Recibos revisados por pagar"
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold text-slate-900">Compromiso: revisado y sin pagar</h2>
        {compromiso.numRecibos === 0 ? (
          <p className="mt-1 text-sm text-slate-500">No hay recibos revisados esperando pago.</p>
        ) : (
          <div className="mt-1 flex flex-col gap-1 text-sm text-slate-700">
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
      </section>

      {reporte.numRecibos === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          No hay recibos pagados para esta semana.
        </p>
      )}

      {notables.length > 0 && (
        <section
          aria-label="Cambios notables"
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            Cambios notables contra su promedio ({UMBRAL_CAMBIO_NOTABLE}% o más)
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
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
                {n.cambio.toLocaleString("es-MX", { maximumFractionDigits: 1 })}% (
                {money(n.importeSemana)})
              </li>
            ))}
          </ul>
        </section>
      )}

      {reporte.numRecibos > 0 && (
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <Panel
            titulo="Pagado por maquilador"
            descripcion="Parte del total pagado en la semana que le tocó a cada maquilador."
          >
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
          <Panel titulo="Pagado por área" descripcion="Acabados, Armado y Electrificación.">
            <Pastel
              apilado
              porciones={porArea}
              titulo="Gráfica de pastel del importe pagado por área"
              centro={money(reporte.importe)}
              enlace={(p) => {
                const tipo = (Object.keys(ETIQUETA_AREA) as (keyof typeof ETIQUETA_AREA)[]).find(
                  (t) => ETIQUETA_AREA[t] === p.etiqueta
                );
                return tipo ? hrefRegistro({ estado: "pagado", tipo }) : null;
              }}
            />
          </Panel>
        </div>
      )}

      <SeccionDesplegable
        id="ultimas-semanas"
        titulo={`Total pagado en las últimas ${tablero.semanas.length} semanas`}
        descripcion="La barra más fuerte es la semana que estás viendo."
        resumen={money(tablero.importeSemana)}
      >
        <BarrasSemanales
          titulo="Barras del total pagado por semana"
          resaltar={indiceVista}
          puntos={tablero.totalesPorSemana.map((t) => ({
            etiqueta: etiquetaCorta(t.semana),
            importe: t.importe,
            detalle: `${t.recibos} recibo${t.recibos === 1 ? "" : "s"}`,
          }))}
        />
      </SeccionDesplegable>

      {tablero.maquiladores.length > 0 && (
        <SeccionDesplegable
          id="rendimiento"
          titulo="Rendimiento por maquilador"
          descripcion={`Lo cobrado por cada maquilador en las últimas ${tablero.semanas.length} semanas (hasta la ${semana.semana}). Despliega uno para ver su KPI y sus recibos.`}
          resumen={`${tablero.maquiladores.length} maquilador${tablero.maquiladores.length === 1 ? "" : "es"}`}
        >
          {tablero.maquiladores.map((m) => (
            <SeccionMaquilador
              key={m.contratista}
              m={m}
              color={colorMaquilador(m.contratista, porMaquilador)}
              grupo={gruposPorClave.get(claveContratista(m.contratista))}
              indiceVista={indiceVista}
              semanas={tablero.semanas.length}
            />
          ))}
        </SeccionDesplegable>
      )}

      {resumenesPm && (
        <SeccionDesplegable
          id="pm-cobrado"
          titulo="PM contra cobrado"
          descripcion="Lo que Planeación declaró en los PM de cada O.T. contra lo ya capturado en recibos vigentes."
          resumen={pm?.error ? "No se pudo leer" : `${resumenesPm.length} O.T.`}
        >
          <PanelPmCobrado resumenes={resumenesPm} error={pm?.error ?? null} />
        </SeccionDesplegable>
      )}

      {reporte.numRecibos > 0 && (
        <SeccionDesplegable
          id="recibos"
          titulo="Registro de recibos de la semana"
          descripcion="Todos los recibos pagados, por maquilador y folio."
          resumen={`${reporte.numRecibos} · ${money(reporte.totalPagar)}`}
        >
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
                    Total {etiquetaSemana(semana).toLowerCase()}
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
        </SeccionDesplegable>
      )}

      <p className="text-xs text-slate-500">
        Seguro social: todavía no hay datos de IMSS en el ERP, así que no se descuenta y el total a
        pagar es igual al importe. Cuando existan, se cargará por contratista al folio de mayor
        importe.
      </p>
    </main>
  );

}
