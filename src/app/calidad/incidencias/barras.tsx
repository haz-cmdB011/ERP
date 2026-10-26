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
                <span className="w-44 shrink-0 truncate text-xs text-slate-600 sm:w-52" title={f.nombre}>
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
                {hrefDe ? (
                  <Link href={hrefDe(f.nombre)} className="flex items-center gap-2 rounded hover:bg-slate-50">
                    {contenido}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">{contenido}</div>
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
