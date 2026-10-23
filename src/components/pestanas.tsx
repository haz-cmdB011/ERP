import Link from "next/link";
import IconoMenu, { type NombreIcono } from "@/components/iconos-menu";

export interface Pestana {
  id: string;
  etiqueta: string;
  href: string;
  icono?: NombreIcono;
}

// Pestañas que viven en la dirección (?pestana=...): se pueden compartir, sobreviven a recargar y
// funcionan con teclado (cada pestaña es un enlace). El contenido va en un elemento con
// role="tabpanel", id={idPanel(base)} y aria-labelledby={idPestana(base, activa)}.
export function idPestana(base: string, id: string): string {
  return `${base}-pestana-${id}`;
}

export function idPanel(base: string): string {
  return `${base}-panel`;
}

export default function Pestanas({
  base,
  items,
  activa,
  etiqueta,
}: {
  // Prefijo de los ids (único en la pantalla).
  base: string;
  items: Pestana[];
  activa: string;
  // Nombre accesible del grupo de pestañas.
  etiqueta: string;
}) {
  return (
    <div role="tablist" aria-label={etiqueta} className="flex gap-1 border-b border-slate-200">
      {items.map((p) => {
        const esActiva = p.id === activa;
        return (
          <Link
            key={p.id}
            id={idPestana(base, p.id)}
            role="tab"
            aria-selected={esActiva}
            aria-controls={idPanel(base)}
            href={p.href}
            scroll={false}
            className={`-mb-px inline-flex min-h-11 items-center rounded-t-lg border-b-2 px-4 text-sm font-medium transition-colors ${
              esActiva
                ? "pestana-activa border-brand-600 text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {p.icono && <IconoMenu nombre={p.icono} className="mr-2 h-4 w-4 shrink-0" />}
            {p.etiqueta}
          </Link>
        );
      })}
    </div>
  );
}
