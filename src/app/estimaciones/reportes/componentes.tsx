import Link from "next/link";
import { money } from "@/lib/estimaciones/motor-precio";
import { NOMBRE_TIPO_CUALQUIERA } from "@/lib/estimaciones/revision-db";
import type { KpiMaquilador, Porcion } from "@/lib/estimaciones/reporte-dashboard";
import type { armarReporte } from "@/lib/estimaciones/reporte-semanal";
import { claveContratista } from "@/lib/estimaciones/reporte-semanal";
import { BarrasSemanales, colorDe } from "./graficos";

// Piezas visuales del dashboard del reporte semanal (ver page.tsx).
export const etiquetaCorta = (s: { semana: number }) => `S${s.semana}`;

export function Cambio({ valor, sufijo }: { valor: number | null; sufijo: string }) {
  if (valor == null) return <span className="text-xs text-slate-400">{`— ${sufijo}`}</span>;
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
// no está en el pastel (no cobró esta semana o cayó en "Otros") va en gris.
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
            <span className="ml-1 text-xs text-slate-400">{f.subcuenta}</span>
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
              className="px-4 py-2 text-right font-mono tabular-nums text-slate-400"
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
  semanas,
}: {
  m: KpiMaquilador;
  color: string;
  grupo: ReturnType<typeof armarReporte>["grupos"][number] | undefined;
  indiceVista: number;
  semanas: number;
}) {
  const cobro = m.importeSemana > 0;
  const puntos = m.historial.map((h) => ({
    etiqueta: etiquetaCorta(h.semana),
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
              ? `${m.porcentajeSemana.toLocaleString("es-MX", { maximumFractionDigits: 1 })}% del total · lugar ${m.lugar}`
              : "Sin pago esta semana"}
          </span>
        </span>
        <span className="flex flex-col items-end">
          <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
            {money(m.importeSemana)}
          </span>
          {cobro && <Cambio valor={m.cambioVsAnterior} sufijo="vs sem. anterior" />}
        </span>
        <BarrasSemanales
          compacta
          titulo={`Pagado a ${m.contratista} en las últimas ${semanas} semanas`}
          resaltar={indiceVista}
          puntos={puntos}
        />
        <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-slate-200 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Dato etiqueta="Pagado en la semana" valor={money(m.importeSemana)} />
          <Dato
            etiqueta="Promedio semanal"
            valor={m.semanasConPago > 0 ? money(m.promedioSemanal) : "—"}
            nota={m.semanasConPago > 0 ? `en ${m.semanasConPago} semanas con pago` : undefined}
          />
          <Dato
            etiqueta="Contra su promedio"
            valor={
              m.cambioVsPromedio == null
                ? "—"
                : `${m.cambioVsPromedio > 0 ? "+" : ""}${m.cambioVsPromedio.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`
            }
            nota="de las otras semanas"
          />
          <Dato
            etiqueta="Constancia"
            valor={`${m.semanasConPago} de ${semanas}`}
            nota="semanas con pago"
          />
          <Dato
            etiqueta="Mejor semana"
            valor={m.mejorSemana ? money(m.mejorSemana.importe) : "—"}
            nota={m.mejorSemana ? `Semana ${m.mejorSemana.semana.semana}` : undefined}
          />
          <Dato
            etiqueta="Piezas trabajadas"
            valor={grupo ? piezas(grupo.piezas) : "0"}
            nota={`${m.recibosSemana} recibo${m.recibosSemana === 1 ? "" : "s"} · ${m.otsSemana} O.T.`}
          />
        </div>

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pagado por semana
          </h3>
          <BarrasSemanales
            titulo={`Pagado a ${m.contratista} por semana`}
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
