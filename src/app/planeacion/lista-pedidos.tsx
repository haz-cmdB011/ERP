import EnlaceFila from "@/components/enlace-fila";
import Chevron from "@/components/chevron";

export interface FilaLista {
  clave: string;
  // Número de O.T., o el del PM cuando no tiene O.T.
  titulo: string;
  esOt: boolean;
  // A dónde lleva la fila: el pedido si la O.T. tiene un solo PM; si no, la página de la O.T.
  href: string;
  proyecto: string;
  cliente: string | null;
  pedidos: number;
  avance: React.ReactNode;
  // Acción propia de la fila (enviar a la papelera un PM sin O.T.), solo para quien administra.
  accion?: React.ReactNode;
}

// Lista de Pedidos de Planeación. Toda la fila es un solo enlace (el del número, extendido sobre la
// fila con after:inset-0): tocar cualquier parte abre el pedido, sin enlaces anidados. La acción de la
// fila va aparte, por encima (z-10), para que siga funcionando por su cuenta.
export default function ListaPedidos({
  filas,
  tituloAvance = "Liberado a Producción",
}: {
  filas: FilaLista[];
  // Encabezado de la columna de avance (Calidad la llama "Evaluación").
  tituloAvance?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden items-center gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:flex">
        <span className="w-24 shrink-0">O.T.</span>
        <span className="flex-1">Proyecto</span>
        <span className="w-44 shrink-0">{tituloAvance}</span>
        <span className="w-4 shrink-0" />
      </div>
      <ul className="lista-animada divide-y divide-slate-100">
        {filas.map((f) => (
          <li
            key={f.clave}
            className="group relative flex min-h-14 items-center gap-3 px-4 py-3 transition-colors focus-within:bg-slate-50 hover:bg-slate-50"
          >
            <EnlaceFila
              href={f.href}
              className={`w-20 shrink-0 text-slate-900 outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-brand-600 focus-visible:after:ring-inset sm:w-24 ${
                f.esOt ? "font-mono font-semibold" : "font-medium"
              }`}
            >
              {f.titulo}
            </EnlaceFila>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-900">{f.proyecto}</p>
              <p className="truncate text-xs text-slate-500">
                {[f.cliente, f.pedidos > 1 ? `${f.pedidos} pedidos` : null].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-1.5 sm:hidden">{f.avance}</div>
            </div>
            <div className="hidden w-44 shrink-0 sm:block">{f.avance}</div>
            {f.accion && <div className="relative z-10 shrink-0">{f.accion}</div>}
            <Chevron
              abierto={false}
              className="pointer-events-none h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
