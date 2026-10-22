import Link from "next/link";

export interface Miga {
  etiqueta: string;
  // Sin href: es la pantalla actual.
  href?: string;
}

// Migas de pan: dónde estás y cómo volver ("Pedidos › O.T. 157-26 › PM157-26"). Todas menos la última
// son enlaces. En pantallas angostas cada tramo se recorta con "…" en vez de desbordar la pantalla.
export default function Migas({ items, className = "" }: { items: Miga[]; className?: string }) {
  return (
    <nav aria-label="Migas de pan" className={className}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-slate-500">
        {items.map((m, i) => {
          const ultima = i === items.length - 1;
          return (
            <li key={`${i}-${m.etiqueta}`} className={`flex items-center gap-1.5 ${ultima ? "min-w-0" : "shrink-0 max-w-[9rem] sm:max-w-none"}`}>
              {i > 0 && (
                <span aria-hidden="true" className="text-slate-300">
                  ›
                </span>
              )}
              {m.href && !ultima ? (
                <Link
                  href={m.href}
                  className="truncate font-medium text-slate-600 transition-colors hover:text-brand-700 hover:underline"
                >
                  {m.etiqueta}
                </Link>
              ) : (
                <span aria-current={ultima ? "page" : undefined} className="truncate font-medium text-slate-900">
                  {m.etiqueta}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
