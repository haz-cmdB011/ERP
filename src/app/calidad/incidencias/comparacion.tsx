import Tarjeta from "./tarjeta";

export interface ConteosPeriodo {
  total: number;
  abiertas: number;
  cerradas: number;
}

// Dos anillos, uno por periodo: el del periodo que se mira a la izquierda y el anterior a la derecha. Cada
// anillo se parte en lo que sigue abierto (ámbar) y lo ya cerrado (verde), con el total de reportes en el
// centro; el tamaño es el mismo para que se compare la mezcla, y el total dice cuántos fueron. Debajo,
// cuánto cambió cada dato.
const RADIO = 42;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

function Anillo({
  etiqueta,
  c,
  principal,
}: {
  etiqueta: string;
  c: ConteosPeriodo;
  principal: boolean;
}) {
  // Cada tramo es un arco del círculo: largo = su parte del total, empezando donde acaba el anterior.
  const tramos = [
    { valor: c.abiertas, color: "var(--color-amber-400)" },
    { valor: c.cerradas, color: "var(--color-brand-500)" },
  ];
  let acumulado = 0;
  return (
    <div className={`flex flex-col items-center gap-3 ${principal ? "" : "opacity-75"}`}>
      <div className="relative size-40 sm:size-44">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={RADIO} fill="none" stroke="var(--color-slate-100)" strokeWidth="12" />
          {c.total > 0 &&
            tramos.map((t, k) => {
              if (t.valor === 0) return null;
              const largo = (t.valor / c.total) * CIRCUNFERENCIA;
              const inicio = acumulado;
              acumulado += largo;
              return (
                <circle
                  key={k}
                  cx="50"
                  cy="50"
                  r={RADIO}
                  fill="none"
                  stroke={t.color}
                  strokeWidth="12"
                  strokeDasharray={`${largo} ${CIRCUNFERENCIA - largo}`}
                  strokeDashoffset={-inicio}
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold tabular-nums ${principal ? "text-slate-900" : "text-slate-600"}`}>
            {c.total}
          </span>
          <span className="text-xs text-slate-500">{c.total === 1 ? "reporte" : "reportes"}</span>
        </div>
      </div>
      <p className={`text-center text-sm ${principal ? "font-semibold text-slate-900" : "text-slate-500"}`}>{etiqueta}</p>
      <p className="text-center text-xs tabular-nums text-slate-600">
        <span className="font-semibold text-amber-700">{c.abiertas}</span> abiertos ·{" "}
        <span className="font-semibold text-brand-800">{c.cerradas}</span> cerrados
      </p>
    </div>
  );
}

export default function Comparacion({
  actual,
  anterior,
  etiquetaActual,
  etiquetaAnterior,
}: {
  actual: ConteosPeriodo;
  anterior: ConteosPeriodo;
  etiquetaActual: string;
  etiquetaAnterior: string;
}) {
  const cambios = [
    { nombre: "Reportes", ahora: actual.total, antes: anterior.total, subirEsBueno: false },
    { nombre: "Abiertos", ahora: actual.abiertas, antes: anterior.abiertas, subirEsBueno: false },
    { nombre: "Cerrados", ahora: actual.cerradas, antes: anterior.cerradas, subirEsBueno: true },
  ];

  return (
    <Tarjeta titulo="Comparación con el periodo anterior" descripcion={`${etiquetaActual} contra ${etiquetaAnterior}`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-6">
        <Anillo etiqueta={etiquetaActual} c={actual} principal />
        <span className="self-center text-sm font-medium text-slate-400" aria-hidden>
          contra
        </span>
        <Anillo etiqueta={etiquetaAnterior} c={anterior} principal={false} />
      </div>
      <div className="flex flex-wrap justify-center gap-4 text-xs text-slate-600" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-amber-400" /> Abiertos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-brand-500" /> Cerrados
        </span>
      </div>
      <ul className="flex flex-wrap justify-center gap-2 border-t border-slate-100 pt-4">
        {cambios.map((c) => {
          const cambio = c.ahora - c.antes;
          const bueno = c.subirEsBueno ? cambio > 0 : cambio < 0;
          const malo = c.subirEsBueno ? cambio < 0 : cambio > 0;
          return (
            <li
              key={c.nombre}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                bueno
                  ? "bg-emerald-100 text-emerald-800"
                  : malo
                    ? "bg-rose-100 text-rose-800"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {c.nombre}: {cambio === 0 ? "igual" : `${Math.abs(cambio)} ${cambio > 0 ? "más" : "menos"}`}
            </li>
          );
        })}
      </ul>
      <span className="sr-only">
        {etiquetaActual}: {actual.total} reportes, {actual.abiertas} abiertos y {actual.cerradas} cerrados.{" "}
        {etiquetaAnterior}: {anterior.total} reportes, {anterior.abiertas} abiertos y {anterior.cerradas} cerrados.
      </span>
    </Tarjeta>
  );
}
