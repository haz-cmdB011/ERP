import Tarjeta from "./tarjeta";

export interface ConteosPeriodo {
  total: number;
  abiertas: number;
  cerradas: number;
}

// Una fila por dato (Reportes, Abiertos, Cerrados) con dos puntos sobre la misma recta: el del periodo
// anterior (gris) y el del periodo que se mira (verde), unidos por una línea que muestra hacia dónde
// se movió. A la derecha, cuánto cambió (verde si mejoró, rojo si empeoró).
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
  const grupos = [
    { nombre: "Reportes", ahora: actual.total, antes: anterior.total, subirEsBueno: false },
    { nombre: "Abiertos", ahora: actual.abiertas, antes: anterior.abiertas, subirEsBueno: false },
    { nombre: "Cerrados", ahora: actual.cerradas, antes: anterior.cerradas, subirEsBueno: true },
  ];
  const tope = Math.max(1, ...grupos.flatMap((g) => [g.ahora, g.antes]));
  const pct = (valor: number) => (valor / tope) * 100;

  return (
    <Tarjeta titulo="Comparación con el periodo anterior" descripcion={`${etiquetaActual} contra ${etiquetaAnterior}`}>
      <div className="flex flex-wrap gap-4 text-xs text-slate-600" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-brand-500" /> {etiquetaActual}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-slate-400" /> {etiquetaAnterior}
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-slate-100">
        {grupos.map((g) => {
          const cambio = g.ahora - g.antes;
          const bueno = g.subirEsBueno ? cambio > 0 : cambio < 0;
          const malo = g.subirEsBueno ? cambio < 0 : cambio > 0;
          return (
            <li key={g.nombre} className="grid grid-cols-[5.5rem_1fr_5rem] items-center gap-4 py-4 sm:grid-cols-[7rem_1fr_6rem]">
              <p className="text-sm font-semibold text-slate-800">{g.nombre}</p>
              {/* Recta de 0 al mayor valor de las tres filas; el margen deja sitio a los puntos y a sus números. */}
              <div className="relative mx-4 h-14" aria-hidden>
                <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded bg-slate-200" />
                <div
                  className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded ${
                    bueno ? "bg-emerald-400" : malo ? "bg-rose-400" : "bg-slate-300"
                  }`}
                  style={{ left: `${pct(Math.min(g.ahora, g.antes))}%`, width: `${pct(Math.abs(cambio))}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${pct(g.antes)}%` }}
                >
                  <span className="block size-4 rounded-full border-2 border-white bg-slate-400 shadow" />
                  <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 text-xs font-medium tabular-nums text-slate-500">
                    {g.antes}
                  </span>
                </div>
                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${pct(g.ahora)}%` }}
                >
                  <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-base font-bold tabular-nums text-slate-900">
                    {g.ahora}
                  </span>
                  <span className="block size-5 rounded-full border-2 border-white bg-brand-500 shadow" />
                </div>
              </div>
              <span
                className={`justify-self-end rounded-full px-3 py-1 text-xs font-semibold ${
                  bueno
                    ? "bg-emerald-100 text-emerald-800"
                    : malo
                      ? "bg-rose-100 text-rose-800"
                      : "bg-slate-200 text-slate-600"
                }`}
              >
                {cambio === 0 ? "Igual" : `${Math.abs(cambio)} ${cambio > 0 ? "más" : "menos"}`}
              </span>
              <span className="sr-only">
                {g.nombre}: {g.ahora} en {etiquetaActual} y {g.antes} en {etiquetaAnterior}
              </span>
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}
