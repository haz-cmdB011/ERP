import Tarjeta from "./tarjeta";

export interface ConteosPeriodo {
  total: number;
  abiertas: number;
  cerradas: number;
}

// Dos barras apiladas, una por periodo, a la misma escala: el largo es el total de reportes y cada
// barra se parte en lo que sigue abierto (ámbar) y lo que ya se cerró (verde). Así se ve de un golpe si
// hubo más o menos reportes y si se están cerrando. Debajo, cuánto cambió cada dato.
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
  const tope = Math.max(1, actual.total, anterior.total);

  const periodo = (etiqueta: string, c: ConteosPeriodo, principal: boolean) => (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2">
      <p className={`text-sm ${principal ? "font-semibold text-slate-900" : "text-slate-500"}`}>{etiqueta}</p>
      <p className={`text-right text-sm tabular-nums ${principal ? "font-bold text-slate-900" : "text-slate-500"}`}>
        {c.total} {c.total === 1 ? "reporte" : "reportes"}
      </p>
      <div className="col-span-2 h-11 rounded-lg bg-slate-100">
        {c.total > 0 && (
          <div
            className={`anim-crecer-x flex h-full overflow-hidden rounded-lg ${principal ? "" : "opacity-70"}`}
            style={{ width: `${(c.total / tope) * 100}%` }}
          >
            {c.abiertas > 0 && (
              <div
                className="grid min-w-8 place-items-center bg-amber-400 text-sm font-bold tabular-nums text-amber-950"
                style={{ flexGrow: c.abiertas }}
              >
                {c.abiertas}
              </div>
            )}
            {c.cerradas > 0 && (
              <div
                className="grid min-w-8 place-items-center bg-brand-500 text-sm font-bold tabular-nums text-on-brand"
                style={{ flexGrow: c.cerradas }}
              >
                {c.cerradas}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const cambios = [
    { nombre: "Reportes", ahora: actual.total, antes: anterior.total, subirEsBueno: false },
    { nombre: "Abiertos", ahora: actual.abiertas, antes: anterior.abiertas, subirEsBueno: false },
    { nombre: "Cerrados", ahora: actual.cerradas, antes: anterior.cerradas, subirEsBueno: true },
  ];

  return (
    <Tarjeta titulo="Comparación con el periodo anterior" descripcion={`${etiquetaActual} contra ${etiquetaAnterior}`}>
      <div className="flex flex-col gap-5">
        {periodo(etiquetaActual, actual, true)}
        {periodo(etiquetaAnterior, anterior, false)}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-600" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded bg-amber-400" /> Abiertos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded bg-brand-500" /> Cerrados
        </span>
      </div>
      <ul className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
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
