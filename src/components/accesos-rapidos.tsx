import Link from "next/link";
import IconoMenu, { type NombreIcono } from "@/components/iconos-menu";

export interface Acceso {
  href: string;
  icono: NombreIcono;
  titulo: string;
  detalle: string;
  // El acceso principal del área (la acción que más se hace), resaltado.
  principal?: boolean;
}

// Accesos de la pantalla de inicio de un área: lo que se hace con más frecuencia a un toque, con icono
// y una línea que explica de qué se trata, para no depender de abrir el menú de tres rayas.
export default function AccesosRapidos({ accesos }: { accesos: Acceso[] }) {
  return (
    <nav aria-label="Accesos rápidos" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {accesos.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-brand-500 ${
            a.principal
              ? "border-brand-600 bg-brand-500 text-on-brand hover:bg-brand-400"
              : "border-slate-200 border-l-4 border-l-emerald-500 bg-white text-slate-900 hover:bg-brand-50"
          }`}
        >
          <span
            className={`acceso-icono flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              a.principal ? "bg-white/20" : "bg-emerald-100 text-emerald-800 group-hover:bg-emerald-200"
            }`}
          >
            <IconoMenu nombre={a.icono} className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight">{a.titulo}</span>
            <span className={`block truncate text-xs ${a.principal ? "text-on-brand/80" : "text-slate-500"}`}>
              {a.detalle}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
