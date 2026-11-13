import Link from "next/link";
import type { ConteoAbiertos } from "@/lib/calidad/incidencias";
import Tarjeta from "./tarjeta";

// Lista de barras horizontales: el largo es el total y la parte ámbar, lo que
// sigue abierto. Si hay `hrefDe`, cada fila filtra el tablero por ese valor.
export default function Barras({
  titulo,
  descripcion,
  filas,
  maximo = 8,
  hrefDe,
  desplegable = false,
  plana = false,
}: {
  titulo: string;
  descripcion?: string;
  filas: ConteoAbiertos[];
  maximo?: number;
  hrefDe?: (nombre: string) => string;
  desplegable?: boolean;
  plana?: boolean;
}) {
  const visibles = filas.slice(0, maximo);
  const tope = Math.max(1, ...visibles.map((f) => f.total));
  return (
    <Tarjeta titulo={titulo} descripcion={descripcion} desplegable={desplegable} plana={plana}>
      {visibles.length === 0 ? (
        <p className="text-sm text-slate-500">Sin datos con estos filtros.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((f) => {
            const contenido = (
              <>
                {/* En celular el nombre va en su renglón (junto a la barra se cortaba a la mitad). */}
                <span className="w-full truncate text-xs text-slate-600 sm:w-52 sm:shrink-0" title={f.nombre}>
                  {f.nombre}
                </span>
                <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="h-full bg-brand-500"
                    style={{ width: `${((f.total - f.abiertas) / tope) * 100}%` }}
                  />
                  <span className="h-full bg-amber-400" style={{ width: `${(f.abiertas / tope) * 100}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-900">
                  {f.total}
                  {f.abiertas > 0 && <span className="text-amber-700"> · {f.abiertas}</span>}
                </span>
              </>
            );
            return (
              <li key={f.nombre}>
                {/* Con dedo, cada fila mide 44 px: a 18 px, una pegada a la otra, el toque caía en la vecina. */}
                {hrefDe ? (
                  <Link
                    href={hrefDe(f.nombre)}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded py-0.5 hover:bg-brand-50 pointer-coarse:min-h-11 sm:flex-nowrap"
                  >
                    {contenido}
                  </Link>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">{contenido}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {filas.length > maximo && (
        <p className="text-xs text-slate-500">y {filas.length - maximo} más; usa los filtros para verlos.</p>
      )}
    </Tarjeta>
  );
}
