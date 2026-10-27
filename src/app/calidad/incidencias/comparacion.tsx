import Tarjeta from "./tarjeta";

export interface ConteosPeriodo {
  total: number;
  abiertas: number;
  cerradas: number;
}

// Barras agrupadas: por cada dato (Reportes, Abiertos, Cerrados) una barra del periodo que se mira
// y otra del periodo anterior, a la misma escala para que se vea de un golpe si subió o bajó.
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
    { nombre: "Reportes", ahora: actual.total, antes: anterior.total },
    { nombre: "Abiertos", ahora: actual.abiertas, antes: anterior.abiertas },
    { nombre: "Cerrados", ahora: actual.cerradas, antes: anterior.cerradas },
  ];
  const tope = Math.max(1, ...grupos.flatMap((g) => [g.ahora, g.antes]));

  const barra = (valor: number, clase: string) => (
    <div className="flex items-center gap-2">
      <div className="h-5 flex-1 rounded bg-slate-100">
        <div className={`h-5 rounded ${clase}`} style={{ width: `${valor === 0 ? 0 : Math.max(2, (valor / tope) * 100)}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-900">{valor}</span>
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
      <ul className="flex flex-col gap-4">
        {grupos.map((g) => (
          <li key={g.nombre} className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.nombre}</p>
            {barra(g.ahora, "bg-brand-500")}
            {barra(g.antes, "bg-slate-300")}
            <span className="sr-only">
              {g.nombre}: {g.ahora} en {etiquetaActual} y {g.antes} en {etiquetaAnterior}
            </span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
