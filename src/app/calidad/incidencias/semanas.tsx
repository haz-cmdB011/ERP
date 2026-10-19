import Link from "next/link";
import type { ConteoSemana } from "@/lib/calidad/incidencias";
import { rangoCorto } from "./formato";
import Tarjeta from "./tarjeta";

const ALTO = 120;

// Una columna por semana del año (de lunes a domingo, como la hoja ESTATUS del
// Excel). La parte ámbar es lo que sigue abierto. Tocar una columna abre esa
// semana en el tablero.
export default function Semanas({
  semanas,
  hrefDe,
  desplegable = false,
}: {
  semanas: ConteoSemana[];
  // Enlace a la semana que empieza en `inicio`.
  hrefDe: (inicio: string) => string;
  desplegable?: boolean;
}) {
  const tope = Math.max(1, ...semanas.map((s) => s.total));
  return (
    <Tarjeta
      titulo="Todas las semanas del año"
      descripcion="Toca una semana para abrirla. El número de abajo es la semana del año."
      desplegable={desplegable}
    >
      {semanas.length === 0 ? (
        <p className="text-sm text-slate-500">Sin reportes con fecha con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto pb-1">
          <ul className="flex items-end gap-1" style={{ height: ALTO + 40 }}>
            {semanas.map((s) => {
              const alto = s.total === 0 ? 2 : Math.max(4, (s.total / tope) * ALTO);
              const abierto = s.total === 0 ? 0 : (s.abiertas / s.total) * alto;
              const texto = `Semana ${s.numero} (${rangoCorto(s.inicio, s.fin)}): ${s.total} reportes, ${s.abiertas} abiertos`;
              return (
                <li key={s.clave} className="flex shrink-0 flex-col items-center gap-1" style={{ width: 28 }}>
                  <Link
                    href={hrefDe(s.inicio)}
                    title={texto}
                    aria-label={texto}
                    className="flex w-full flex-col items-center justify-end gap-0.5 rounded-sm hover:bg-slate-50"
                    style={{ height: ALTO + 18 }}
                  >
                    <span className="text-[10px] tabular-nums leading-none text-slate-500">{s.total || ""}</span>
                    <span className="flex w-4 flex-col justify-end overflow-hidden rounded-t" style={{ height: alto }}>
                      <span className="w-full bg-amber-400" style={{ height: abierto }} />
                      <span className="w-full bg-brand-500" style={{ height: alto - abierto }} />
                    </span>
                  </Link>
                  <span className="text-[10px] tabular-nums text-slate-500">{s.numero}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand-500" />
          Cerrados
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />
          Abiertos
        </span>
      </div>
    </Tarjeta>
  );
}
