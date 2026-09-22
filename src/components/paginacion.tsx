import Link from "next/link";

export const TAMANO_PAGINA = 100;

// Pie de tabla con "Mostrando X–Y de N" y enlaces Anterior / Siguiente. Los
// enlaces son navegación normal (sin estado de cliente): `href(n)` arma la URL
// de la página n conservando el resto de los filtros.
export default function Paginacion({
  pagina,
  total,
  href,
  tamano = TAMANO_PAGINA,
}: {
  pagina: number;
  total: number;
  href: (pagina: number) => string;
  tamano?: number;
}) {
  if (total === 0) return null;

  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const desde = (pagina - 1) * tamano + 1;
  const hasta = Math.min(pagina * tamano, total);
  const estiloEnlace =
    "rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-50";
  const estiloInactivo =
    "rounded-lg border border-slate-100 px-3 py-1.5 font-medium text-slate-300";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
      <p>
        Mostrando {desde}–{hasta} de {total}
      </p>
      {totalPaginas > 1 && (
        <div className="flex items-center gap-2">
          {pagina > 1 ? (
            <Link href={href(pagina - 1)} className={estiloEnlace}>
              ← Anterior
            </Link>
          ) : (
            <span className={estiloInactivo}>← Anterior</span>
          )}
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          {pagina < totalPaginas ? (
            <Link href={href(pagina + 1)} className={estiloEnlace}>
              Siguiente →
            </Link>
          ) : (
            <span className={estiloInactivo}>Siguiente →</span>
          )}
        </div>
      )}
    </div>
  );
}
