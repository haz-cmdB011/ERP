import Link from "next/link";
import { money } from "@/lib/estimaciones/motor-precio";
import { NOMBRE_TIPO_CUALQUIERA } from "@/lib/estimaciones/revision-db";
import type { KpiMaquilador, Porcion } from "@/lib/estimaciones/reporte-dashboard";
import type { FilaComparativa, Metrica } from "@/lib/estimaciones/reporte-comparativa";
import { etiquetaCortaPeriodo, type TextosPeriodo } from "@/lib/estimaciones/reporte-periodos";
import type { armarReporte } from "@/lib/estimaciones/reporte-semanal";
import { claveContratista } from "@/lib/estimaciones/reporte-semanal";
import { BarrasPorPeriodo, colorDe } from "./graficos";

// Piezas visuales del dashboard del reporte (ver page.tsx).

export function Cambio({ valor, sufijo }: { valor: number | null; sufijo: string }) {
  if (valor == null) return <span className="text-xs text-slate-500">{`— ${sufijo}`}</span>;
  if (valor === 0) return <span className="text-xs text-slate-500">{`= ${sufijo}`}</span>;
  const sube = valor > 0;
  return (
    <span
      className={`text-xs font-medium ${sube ? "text-emerald-700" : "text-rose-700"}`}
    >
      {sube ? "▲" : "▼"} {Math.abs(valor).toLocaleString("es-MX", { maximumFractionDigits: 1 })}%{" "}
      <span className="font-normal text-slate-500">{sufijo}</span>
    </span>
  );
}

export function Tarjeta({
  titulo,
  valor,
  pie,
}: {
  titulo: string;
  valor: string;
  pie?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</span>
      <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
        {valor}
      </span>
      {pie && <div className="min-h-4">{pie}</div>}
    </div>
  );
}

export function Panel({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}

export function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="flex flex-col rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {etiqueta}
      </span>
      <span className="text-base font-semibold tabular-nums text-slate-900">{valor}</span>
      {nota && <span className="text-[11px] text-slate-500">{nota}</span>}
    </div>
  );
}


// El color de un maquilador en la sección es el de su rebanada del pastel; si
// no está en el pastel (no cobró en el periodo o cayó en "Otros") va en gris.
const piezas = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 2 });

export function colorMaquilador(
  nombre: string,
  porciones: Porcion[]
): string {
  const clave = claveContratista(nombre);
  const i = porciones.findIndex((p) => claveContratista(p.etiqueta) === clave);
  return i >= 0 ? colorDe(porciones, i) : "var(--serie-otros)";
}

export function FilasGrupo({
  grupo,
  mostrarNombre,
}: {
  grupo: ReturnType<typeof armarReporte>["grupos"][number];
  mostrarNombre: boolean;
}) {
  return (
    <>
      {grupo.filas.map((f, i) => (
        <tr key={`${f.tipo}-${f.folio}`} className="border-t border-slate-100">
          {mostrarNombre ? (
            <td className="px-4 py-2 font-medium text-slate-900">{i === 0 ? grupo.contratista : ""}</td>
          ) : null}
          <td className="px-4 py-2 text-slate-700">
            {NOMBRE_TIPO_CUALQUIERA[f.tipo]}
            <span className="ml-1 text-xs text-slate-500">{f.subcuenta}</span>
          </td>
          <td className="px-4 py-2">
            <Link
              href={`/estimaciones/recibos/${f.tipo}/recibo/${encodeURIComponent(f.folio)}`}
              className="font-mono text-slate-700 hover:text-brand-700 hover:underline"
            >
              EST-{f.folio}
            </Link>
          </td>
          <td className="px-4 py-2">
            <span className="font-mono text-slate-700">{f.ot || "Sin OT"}</span>
            {f.obra && <span className="ml-2 text-xs text-slate-500">{f.obra}</span>}
          </td>
          <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700">
            {money(f.importe)}
          </td>
          {mostrarNombre ? (
            <td
              className="px-4 py-2 text-right font-mono tabular-nums text-slate-500"
              title={f.seguroSocial == null ? "Sin datos de IMSS todavía" : undefined}
            >
              {f.seguroSocial == null ? "—" : money(f.seguroSocial)}
            </td>
          ) : (
            <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700">
              {piezas(f.piezas)}
            </td>
          )}
          <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
            {money(f.totalPagar)}
          </td>
        </tr>
      ))}
    </>
  );
}

export function SeccionMaquilador({
  m,
  color,
  grupo,
  indiceVista,
  textos,
}: {
  m: KpiMaquilador;
  color: string;
  grupo: ReturnType<typeof armarReporte>["grupos"][number] | undefined;
  indiceVista: number;
  textos: TextosPeriodo;
}) {
  const cobro = m.importe > 0;
  const periodos = m.historial.length;
  const puntos = m.historial.map((h) => ({
    etiqueta: etiquetaCortaPeriodo(h.periodo),
    importe: h.importe,
    detalle: `${h.recibos} recibo${h.recibos === 1 ? "" : "s"}`,
  }));

  return (
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-slate-50">
        <span
          aria-hidden="true"
          className="h-3 w-3 shrink-0 rounded-sm"
          style={{ background: color }}
        />
        <span className="min-w-0 flex-1 basis-40">
          <span className="block truncate text-sm font-semibold text-slate-900">{m.contratista}</span>
          <span className="text-xs text-slate-500">
            {cobro
              ? `${m.porcentaje.toLocaleString("es-MX", { maximumFractionDigits: 1 })}% del total · lugar ${m.lugar}`
              : `Sin pago ${textos.este}`}
          </span>
        </span>
        <span className="flex flex-col items-end">
          <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
            {money(m.importe)}
          </span>
          {cobro && <Cambio valor={m.cambioVsAnterior} sufijo={textos.vsAnterior} />}
        </span>
        <BarrasPorPeriodo
          compacta
          titulo={`Pagado a ${m.contratista} en los últimos ${periodos} ${textos.plural}`}
          resaltar={indiceVista}
          puntos={puntos}
        />
        <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-slate-200 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Dato etiqueta={`Pagado ${textos.este}`} valor={money(m.importe)} />
          <Dato
            etiqueta={textos.promedio}
            valor={m.periodosConPago > 0 ? money(m.promedio) : "—"}
            nota={m.periodosConPago > 0 ? `en ${m.periodosConPago} ${textos.plural} con pago` : undefined}
          />
          <Dato
            etiqueta="Contra su promedio"
            valor={
              m.cambioVsPromedio == null
                ? "—"
                : `${m.cambioVsPromedio > 0 ? "+" : ""}${m.cambioVsPromedio.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`
            }
            nota={`de los otros ${textos.plural}`}
          />
          <Dato
            etiqueta="Constancia"
            valor={`${m.periodosConPago} de ${periodos}`}
            nota={`${textos.plural} con pago`}
          />
          <Dato
            etiqueta={textos.mejor}
            valor={m.mejor ? money(m.mejor.importe) : "—"}
            nota={m.mejor ? etiquetaCortaPeriodo(m.mejor.periodo) : undefined}
          />
          <Dato
            etiqueta="Piezas trabajadas"
            valor={grupo ? piezas(grupo.piezas) : "0"}
            nota={`${m.recibos} recibo${m.recibos === 1 ? "" : "s"} · ${m.ots} O.T.`}
          />
        </div>

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pagado por {textos.singular}
          </h3>
          <BarrasPorPeriodo
            titulo={`Pagado a ${m.contratista} por ${textos.singular}`}
            resaltar={indiceVista}
            puntos={puntos}
          />
        </div>

        {grupo && grupo.filas.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Área</th>
                  <th className="px-4 py-2">Folio</th>
                  <th className="px-4 py-2">OT</th>
                  <th className="px-4 py-2 text-right">Importe</th>
                  <th className="px-4 py-2 text-right">Piezas</th>
                  <th className="px-4 py-2 text-right">Total a pagar</th>
                </tr>
              </thead>
              <tbody>
                <FilasGrupo grupo={grupo} mostrarNombre={false} />
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 text-sm font-semibold">
                  <td colSpan={3} className="px-4 py-2 text-right text-slate-600">
                    Total
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{money(grupo.importe)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {piezas(grupo.piezas)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {money(grupo.totalPagar)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

const ROTULO_ESTADO: Partial<Record<FilaComparativa["estado"], string>> = {
  nuevo: "Nuevo",
  "sin-pago": "Sin pago",
};

const firmado = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;

// Cambio de cada fila contra el periodo anterior: barras que salen a la derecha
// (cobró más) o a la izquierda (cobró menos) de un eje central, a una misma
// escala. El importe con signo y el % van en texto: el color no es lo único.
export function CambiosDivergentes({ filas }: { filas: FilaComparativa[] }) {
  const maximo = Math.max(...filas.map((f) => Math.abs(f.diferencia)), 0);
  return (
    <ul className="flex flex-col gap-2">
      {filas.map((f) => {
        const ancho = maximo > 0 ? (Math.abs(f.diferencia) / maximo) * 50 : 0;
        const sube = f.diferencia > 0;
        const rotulo = ROTULO_ESTADO[f.estado];
        return (
          <li
            key={f.etiqueta}
            className="grid grid-cols-[minmax(0,7rem)_minmax(4rem,1fr)_6.5rem] items-center gap-2 text-sm sm:grid-cols-[minmax(0,11rem)_minmax(6rem,1fr)_10.5rem]"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-slate-700" title={f.etiqueta}>
                {f.etiqueta}
              </span>
              {rotulo && <span className="text-[11px] font-medium text-slate-500">{rotulo}</span>}
            </span>
            <span
              role="img"
              aria-label={`${f.etiqueta}: ${firmado(f.diferencia)}`}
              className="relative block h-3.5 rounded bg-slate-50"
            >
              <span className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
              {f.diferencia !== 0 && (
                <span
                  className={`absolute inset-y-0.5 rounded-sm ${
                    sube ? "left-1/2 bg-emerald-500" : "right-1/2 bg-rose-500"
                  }`}
                  style={{ width: `${ancho}%` }}
                />
              )}
            </span>
            <span className="flex flex-col items-end whitespace-nowrap text-right sm:flex-row sm:items-baseline sm:justify-end sm:gap-2">
              <span
                className={`font-mono text-xs font-semibold tabular-nums ${
                  f.diferencia > 0 ? "text-emerald-700" : f.diferencia < 0 ? "text-rose-700" : "text-slate-500"
                }`}
              >
                {f.diferencia === 0 ? "Igual" : firmado(f.diferencia)}
              </span>
              {f.estado !== "nuevo" && f.estado !== "sin-pago" && f.cambio != null && f.diferencia !== 0 && (
                <span className="font-mono text-[11px] tabular-nums text-slate-500 sm:w-12">
                  {f.cambio > 0 ? "+" : ""}
                  {f.cambio.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface FilaMetrica {
  nombre: string;
  m: Metrica;
  // Importe en pesos (si no, un conteo).
  dinero?: boolean;
}

// Cada cifra clave con dos barras a la misma escala: el periodo anterior en gris
// y el actual en color, con su cambio al lado. Los valores van también en texto.
export function MetricasComparadas({
  filas,
  etiquetaActual,
  etiquetaAnterior,
}: {
  filas: FilaMetrica[];
  etiquetaActual: string;
  etiquetaAnterior: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--serie-otros)", opacity: 0.55 }} />
          {etiquetaAnterior}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--serie-1)" }} />
          {etiquetaActual}
        </span>
      </div>
      {filas.map(({ nombre, m, dinero }) => {
        const formato = (n: number) => (dinero ? money(n) : String(n));
        const maximo = Math.max(m.actual, m.anterior, 0);
        const ancho = (n: number) => (maximo > 0 ? Math.max((n / maximo) * 100, n > 0 ? 1.5 : 0) : 0);
        return (
          <div key={nombre} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-900">{nombre}</span>
              {m.diferencia === 0 ? (
                <span className="text-xs text-slate-500">Igual</span>
              ) : m.cambio == null ? (
                <span className="text-xs font-medium text-slate-600">Nuevo</span>
              ) : (
                <Cambio valor={m.cambio} sufijo="" />
              )}
            </div>
            {[
              { valor: m.anterior, color: "var(--serie-otros)", opacidad: 0.55, nombre: etiquetaAnterior },
              { valor: m.actual, color: "var(--serie-1)", opacidad: 1, nombre: etiquetaActual },
            ].map((b) => (
              <div key={b.nombre} className="flex items-center gap-2" title={`${b.nombre}: ${formato(b.valor)}`}>
                <span className="h-2.5 min-w-0 flex-1 rounded-sm bg-slate-50">
                  <span
                    className="anim-crecer-x block h-full rounded-sm"
                    style={{ width: `${ancho(b.valor)}%`, background: b.color, opacity: b.opacidad }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-slate-600">
                  {formato(b.valor)}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
