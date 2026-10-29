import Tarjeta from "./tarjeta";

export interface ConteosPeriodo {
  total: number;
  abiertas: number;
  cerradas: number;
}

// Columnas agrupadas: por cada dato (Reportes, Abiertos, Cerrados) una columna del periodo que se mira
// y otra del periodo anterior, a la misma escala para que se vea de un golpe si subió o bajó. Debajo de
// cada grupo, cuánto cambió (en verde si mejoró y en rojo si empeoró).
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

  const columna = (valor: number, clase: string) => (
    <div className="flex h-full w-full max-w-16 flex-col items-center justify-end gap-1">
      <span className="text-lg font-bold tabular-nums text-slate-900">{valor}</span>
      <div
        className={`w-full rounded-t-md ${clase}`}
        // Deja arriba el sitio del número para que la columna más alta no se salga del cuadro.
        style={{ height: valor === 0 ? "2px" : `max(4px, calc((100% - 2rem) * ${valor / tope}))` }}
      />
    </div>
  );

  return (
    <Tarjeta titulo="Comparación con el periodo anterior" descripcion={`${etiquetaActual} contra ${etiquetaAnterior}`}>
      <div className="flex flex-wrap gap-4 text-xs text-slate-600" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-brand-500" /> {etiquetaActual}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-slate-300" /> {etiquetaAnterior}
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-4">
        {grupos.map((g) => {
          const cambio = g.ahora - g.antes;
          const bueno = g.subirEsBueno ? cambio > 0 : cambio < 0;
          const malo = g.subirEsBueno ? cambio < 0 : cambio > 0;
          return (
            <li key={g.nombre} className="flex flex-col items-center gap-2 rounded-lg bg-slate-50 px-3 pb-3 pt-4">
              <div className="flex h-44 w-full items-end justify-center gap-3 border-b border-slate-300">
                {columna(g.ahora, "bg-brand-500")}
                {columna(g.antes, "bg-slate-300")}
              </div>
              <p className="text-sm font-semibold text-slate-800">{g.nombre}</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
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
