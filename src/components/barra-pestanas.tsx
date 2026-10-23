import Link from "next/link";
import IconoMenu, { type NombreIcono } from "@/components/iconos-menu";

export interface ItemPestana {
  id: string;
  etiqueta: string;
  href: string;
  icono?: NombreIcono;
}

// Pestañas hermanas que son pantallas distintas (cada una con su propia dirección): se ve
// cuál está activa y las demás están a un toque. Son enlaces dentro de un <nav>, no un
// tablist, porque cambian de página. Con muchas, se desplazan de lado en celular.
// Cada pestaña puede llevar un icono (`icono`, de components/iconos-menu.tsx) antes de su nombre.
export default function BarraPestanas({
  items,
  activa,
  etiqueta,
}: {
  items: ItemPestana[];
  activa: string;
  // Nombre accesible del grupo ("Secciones del taller").
  etiqueta: string;
}) {
  return (
    <nav
      aria-label={etiqueta}
      className="desplazable-sin-barra -mx-1 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-slate-200 px-1 print:hidden"
    >
      {items.map((p) => {
        const esActiva = p.id === activa;
        return (
          <Link
            key={p.id}
            href={p.href}
            aria-current={esActiva ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 items-center rounded-t-lg border-b-2 px-4 text-sm font-medium transition-colors ${
              esActiva
                ? "pestana-activa border-brand-600 font-semibold text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {p.icono && <IconoMenu nombre={p.icono} className="mr-2 h-4 w-4 shrink-0" />}
            {p.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
