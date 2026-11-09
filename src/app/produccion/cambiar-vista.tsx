import Link from "next/link";

export type VistaInicio = "tablero" | "lista";

// Interruptor del inicio de Producción entre el tablero (por omisión) y la lista. Es un enlace con
// `?vista=`, así que se puede compartir y recarga en la misma vista.
export default function CambiarVista({ vista }: { vista: VistaInicio }) {
  const opciones: { valor: VistaInicio; etiqueta: string; href: string }[] = [
    { valor: "tablero", etiqueta: "Tablero", href: "/produccion" },
    { valor: "lista", etiqueta: "Lista", href: "/produccion?vista=lista" },
  ];
  return (
    <nav aria-label="Cómo ver la bitácora" className="flex shrink-0 gap-1 rounded-full bg-slate-100 p-0.5">
      {opciones.map((o) => (
        <Link
          key={o.valor}
          href={o.href}
          aria-current={vista === o.valor ? "page" : undefined}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            vista === o.valor ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.etiqueta}
        </Link>
      ))}
    </nav>
  );
}
