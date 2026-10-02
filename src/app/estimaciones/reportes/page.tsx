import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import { money } from "@/lib/estimaciones/motor-precio";
import { cargarOtContraCobrado, resumirPorOt } from "@/lib/estimaciones/pm-cobrado";
import {
  agruparEnOtros,
  armarTablero,
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

export const metadata = { title: "Reporte semanal" };

// Día-mes-año (ej. "14-09-2026").
function fechaNumerica(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}-${mes}-${anio}`;
}

function leerSemana(anio?: string, semana?: string): Semana {
  const a = Number(anio);
  const s = Number(semana);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return semanaPorReportar();
  if (!Number.isInteger(s) || s < 1 || s > semanasDelAnio(a)) return { anio: a, semana: 1 };
  return { anio: a, semana: s };
}

const consulta = (s: Semana) => `anio=${s.anio}&semana=${s.semana}`;
const hrefSemana = (s: Semana) => `/estimaciones/reportes?${consulta(s)}`;

// Dashboard del reporte semanal (sustituye "Estimaciones SEM nn" y "FORMATO
// MAQUILA"): recibos PAGADOS de las tres áreas. La semana N junta lo pagado en
// la semana N+1. Arriba, las cifras y gráficas de la semana; luego una sección
// por maquilador con su rendimiento en las últimas semanas; el PM contra
// cobrado; y la tabla de recibos, en un desplegable. RLS limita la lectura al
// personal de Estimaciones; el maquilador no entra aquí.
export default async function ReporteSemanalPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; semana?: string }>;
}) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (esMaquilador(perfil)) {
    redirect("/estimaciones/mis-recibos");
  }
  const verPm = puedeVerPrecioSugerido(perfil);

  const params = await searchParams;
  const semana = leerSemana(params.anio, params.semana);
  const trabajo = rangoSemana(semana);
  const pago = rangoSemana(semanaDePago(semana));

  // Historial: las últimas semanas hasta la vista, en una sola consulta.
  const tableroVacio = armarTablero([], semana);
  const { primera, ultima } = semanasDePagoDelHistorial(tableroVacio.semanas);
  const [{ recibos: recibosHistorial, error }, pm] = await Promise.all([
    cargarRecibosPagadosEntre(supabase, rangoSemana(primera).desde, rangoSemana(ultima).hasta),
    verPm ? cargarOtContraCobrado(supabase) : Promise.resolve(null),
  ]);

  const tablero = armarTablero(recibosHistorial, semana);
  const recibos = recibosHistorial.filter((r) => {
    const s = semanaDeReporteDe(r.pagadoEn);
    return s.anio === semana.anio && s.semana === semana.semana;
  });
  const reporte = armarReporte(recibos);
  const gruposPorClave = new Map(reporte.grupos.map((g) => [claveContratista(g.contratista), g]));

  const porMaquilador = agruparEnOtros(repartoPorMaquilador(recibos), 8);
  const porArea = repartoPorArea(recibos);
  const resumenesPm = pm ? resumirPorOt(pm.filas) : null;

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
            Semana del {fechaNumerica(trabajo.desde)} al {fechaNumerica(trabajo.hasta)}. Recibos
            pagados del {fechaNumerica(pago.desde)} al {fechaNumerica(pago.hasta)} en Acabados,
            Armado y Electrificación.
          </p>
        </div>
        {reporte.numRecibos > 0 && (
          <a
            href={`/api/estimaciones/reporte-semanal?${consulta(semana)}`}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Descargar Excel
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={hrefSemana(anterior)}
          className="rounded bg-white px-3 py-1 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          ← Semana {anterior.semana}
        </Link>
        <form action="/estimaciones/reportes" className="flex items-center gap-2">
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
            className="rounded bg-slate-900 px-3 py-1 font-semibold text-white hover:bg-slate-800"
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
            className="px-2 font-medium text-indigo-600 hover:underline"
          >
            Semana por pagar ({porReportar.semana})
          </Link>
        )}
        <a href="#pm-cobrado" className="px-2 font-medium text-indigo-600 hover:underline">
          PM contra cobrado ↓
        </a>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          No se pudieron leer los recibos: {error}
        </p>
      )}

      {/* KPI de la semana */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta
          titulo="Total pagado"
          valor={money(tablero.importeSemana)}
          pie={<Cambio valor={tablero.cambioTotalVsAnterior} sufijo="vs semana anterior" />}
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

      {!error && reporte.numRecibos === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          No hay recibos pagados para esta semana.
        </p>
      )}

      {reporte.numRecibos > 0 && (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Panel
              titulo="Pagado por maquilador"
              descripcion="Parte del total pagado en la semana que le tocó a cada maquilador."
            >
              <Pastel
                porciones={porMaquilador}
                titulo="Gráfica de pastel del importe pagado a cada maquilador"
                centro={money(reporte.importe)}
              />
            </Panel>
          </div>
          <div className="lg:col-span-2">
            <Panel titulo="Pagado por área" descripcion="Acabados, Armado y Electrificación.">
              <Pastel
                porciones={porArea}
                titulo="Gráfica de pastel del importe pagado por área"
                apilado
                centro={money(reporte.importe)}
              />
            </Panel>
          </div>
        </div>
      )}

      <Panel
        titulo={`Total pagado en las últimas ${tablero.semanas.length} semanas`}
        descripcion="La barra más fuerte es la semana que estás viendo."
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
      </Panel>

      {/* Rendimiento por maquilador: una sección desplegable cada uno */}
      {tablero.maquiladores.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Rendimiento por maquilador</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Lo cobrado por cada maquilador en las últimas {tablero.semanas.length} semanas (hasta
              la {semana.semana}). Despliega uno para ver su KPI y sus recibos.
            </p>
          </div>
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
        </section>
      )}

      {resumenesPm && <PanelPmCobrado resumenes={resumenesPm} error={pm?.error ?? null} />}

      {/* Registro de recibos de la semana, desplegable */}
      {reporte.numRecibos > 0 && (
        <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <span>
              Registro de recibos de la semana ({reporte.numRecibos}) · {money(reporte.totalPagar)}
            </span>
            <span
              aria-hidden="true"
              className="text-slate-400 transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <div className="overflow-x-auto border-t border-slate-200">
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
        </details>
      )}

      <p className="text-xs text-slate-400">
        Seguro social: todavía no hay datos de IMSS en el ERP, así que no se descuenta y el total a
        pagar es igual al importe. Cuando existan, se cargará por contratista al folio de mayor
        importe.
      </p>
    </main>
  );

}
