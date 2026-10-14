import Link from "next/link";
import { SEMANA_SIN_FECHA, type ConteoSemana } from "@/lib/calidad/incidencias";

export function diaCorto(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function rangoDeSemana(s: Pick<ConteoSemana, "inicio" | "fin">): string {
  return `${diaCorto(s.inicio)} – ${diaCorto(s.fin)}`;
}

const ALTO = 120;

// Una columna por semana (de lunes a domingo, como la hoja ESTATUS del Excel).
// La parte ámbar es lo que sigue abierto. Tocar una columna filtra el tablero
// por esa semana; tocarla otra vez quita el filtro.
export default function Semanas({
  semanas,
  sinFecha,
  seleccionada,
  hrefDe,
}: {
  semanas: ConteoSemana[];
  sinFecha: number;
  seleccionada: string | null;
  // `clave` es la semana a filtrar, o null para quitar el filtro.
  hrefDe: (clave: string | null) => string;
}) {
  const tope = Math.max(1, ...semanas.map((s) => s.total));
  const elegida = semanas.find((s) => s.clave === seleccionada);
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Incidencias por semana</h2>
          <p className="text-xs text-slate-500">
            De lunes a domingo. Toca una semana para ver solo sus incidencias; la parte ámbar es lo que sigue abierto.
          </p>
        </div>
        {seleccionada && (
          <Link href={hrefDe(null)} className="text-sm text-slate-500 underline hover:text-slate-700">
            Ver todas las semanas
          </Link>
        )}
      </div>

      {semanas.length === 0 ? (
        <p className="text-sm text-slate-500">Sin incidencias con fecha con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto pb-1">
          <ul className="flex items-end gap-1" style={{ height: ALTO + 40 }}>
            {semanas.map((s) => {
              const activa = s.clave === seleccionada;
              const alto = s.total === 0 ? 2 : Math.max(4, (s.total / tope) * ALTO);
              const abierto = s.total === 0 ? 0 : (s.abiertas / s.total) * alto;
              return (
                <li key={s.clave} className="flex shrink-0 flex-col items-center gap-1" style={{ width: 28 }}>
                  <Link
                    href={hrefDe(activa ? null : s.clave)}
                    title={`Semana ${s.numero} (${rangoDeSemana(s)}): ${s.total} incidencias, ${s.abiertas} abiertas`}
                    aria-label={`Semana ${s.numero}, ${rangoDeSemana(s)}: ${s.total} incidencias, ${s.abiertas} abiertas`}
                    aria-current={activa ? "true" : undefined}
                    className={`flex w-full flex-col items-center justify-end gap-0.5 rounded-sm ${
                      activa ? "bg-brand-100 ring-2 ring-brand-500" : "hover:bg-slate-50"
                    }`}
                    style={{ height: ALTO + 18 }}
                  >
                    <span className="text-[10px] tabular-nums leading-none text-slate-500">{s.total || ""}</span>
                    <span className="flex w-4 flex-col justify-end overflow-hidden rounded-t" style={{ height: alto }}>
                      <span className="w-full bg-amber-400" style={{ height: abierto }} />
                      <span className="w-full bg-brand-500" style={{ height: alto - abierto }} />
                    </span>
                  </Link>
                  <span className={`text-[10px] tabular-nums ${activa ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                    {s.numero}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand-500" />
          Cerradas
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />
          Abiertas
        </span>
        <span>El número de abajo es la semana del año.</span>
        {elegida && (
          <span className="font-medium text-slate-700">
            Semana {elegida.numero}: {rangoDeSemana(elegida)}
          </span>
        )}
        {sinFecha > 0 && (
          <Link
            href={hrefDe(seleccionada === SEMANA_SIN_FECHA ? null : SEMANA_SIN_FECHA)}
            className="ml-auto underline hover:text-slate-700"
          >
            {sinFecha} sin fecha {seleccionada === SEMANA_SIN_FECHA ? "(quitar filtro)" : "(ver)"}
          </Link>
        )}
      </div>
    </section>
  );
}
