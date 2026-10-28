import { ESTADOS_INICIO, pendientesDe, type Conteos } from "@/lib/produccion/inicio";

// Color de cada estado en los anillos y la leyenda (variables de color de Tailwind).
export const COLOR_ESTADO: Record<keyof Conteos, string> = {
  por_liberar: "var(--color-slate-300)",
  por_asignar: "var(--color-amber-400)",
  en_proceso: "var(--color-sky-500)",
  terminado: "var(--color-emerald-500)",
};

const TAMANOS = {
  chico: { anillo: "size-11", centro: "size-8 text-[11px]" },
  grande: { anillo: "size-14", centro: "size-10 text-sm" },
};

// Un anillo con un tramo por estado, del tamaño de los muebles que tiene; al centro, lo que
// sigue pendiente (todo menos lo terminado).
export default function AnilloEstados({
  conteos,
  tamano = "chico",
}: {
  conteos: Conteos;
  tamano?: keyof typeof TAMANOS;
}) {
  const total = ESTADOS_INICIO.reduce((s, e) => s + conteos[e.valor], 0);
  const texto = ESTADOS_INICIO.map((e) => `${conteos[e.valor]} ${e.etiqueta.toLowerCase()}`).join(", ");
  let inicio = 0;
  const tramos = ESTADOS_INICIO.filter((e) => conteos[e.valor] > 0).map((e) => {
    const fin = inicio + (conteos[e.valor] / total) * 100;
    const tramo = `${COLOR_ESTADO[e.valor]} ${inicio}% ${fin}%`;
    inicio = fin;
    return tramo;
  });
  const t = TAMANOS[tamano];
  return (
    <span
      role="img"
      aria-label={texto}
      title={texto}
      className={`grid shrink-0 place-items-center rounded-full ${t.anillo}`}
      style={{ background: total > 0 ? `conic-gradient(${tramos.join(", ")})` : "var(--color-slate-200)" }}
    >
      <span className={`grid place-items-center rounded-full bg-white font-bold tabular-nums text-slate-700 ${t.centro}`}>
        {pendientesDe(conteos)}
      </span>
    </span>
  );
}

// Anillos concéntricos, uno por estado (por liberar afuera, terminados al centro): cada arco,
// con puntas redondas, mide la parte de los muebles que está en ese estado. Arrancan en
// ángulos distintos para que se lean como una espiral y no como un reloj.
export function AnillosConcentricos({ conteos }: { conteos: Conteos }) {
  const total = ESTADOS_INICIO.reduce((s, e) => s + conteos[e.valor], 0);
  const texto = ESTADOS_INICIO.map((e) => `${conteos[e.valor]} ${e.etiqueta.toLowerCase()}`).join(", ");
  const grosor = 4.5;
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={texto} className="size-[5.5rem] shrink-0">
      <title>{texto}</title>
      {ESTADOS_INICIO.map((e, i) => {
        const r = 28.5 - i * 7;
        const largo = 2 * Math.PI * r;
        const parte = total > 0 ? conteos[e.valor] / total : 0;
        return (
          <g key={e.valor} transform={`rotate(${-90 + i * 55} 32 32)`}>
            <circle cx="32" cy="32" r={r} fill="none" stroke={COLOR_ESTADO[e.valor]} strokeOpacity={0.18} strokeWidth={grosor} />
            {parte > 0 && (
              <circle
                cx="32"
                cy="32"
                r={r}
                fill="none"
                stroke={COLOR_ESTADO[e.valor]}
                strokeWidth={grosor}
                strokeLinecap="round"
                // Un arco casi completo deja un respiro para que se vea la punta.
                strokeDasharray={`${Math.max(0.01, Math.min(parte, 0.94)) * largo} ${largo}`}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
