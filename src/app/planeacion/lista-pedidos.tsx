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

// Lista de Pedidos de Planeación y de Calidad: una tarjeta por O.T., del mismo tamaño y estilo que la de
// Producción. Toda la tarjeta es un solo enlace (el del número, extendido sobre la
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
    <ul className="lista-animada flex flex-col gap-3">
      {filas.map((f) => (
        <li
          key={f.clave}
          className="group relative flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 focus-within:bg-slate-50 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <div className="min-w-0 sm:flex-1">
            <EnlaceFila
              href={f.href}
              className={`block text-base text-slate-900 outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-brand-600 focus-visible:after:ring-inset ${
                f.esOt ? "font-mono font-semibold" : "font-semibold"
              }`}
            >
              {f.titulo}
            </EnlaceFila>
            <p className="truncate text-sm text-slate-700">{f.proyecto}</p>
            {(f.cliente || f.pedidos > 1) && (
              <p className="truncate text-xs text-slate-500">
                {[f.cliente, f.pedidos > 1 ? `${f.pedidos} pedidos` : null].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 sm:shrink-0">
            <div className="min-w-0 flex-1 sm:w-52 sm:flex-none" role="group" aria-label={tituloAvance}>
              {f.avance}
            </div>
            {f.accion && <div className="relative z-10 shrink-0">{f.accion}</div>}
            <Chevron
              abierto={false}
              className="pointer-events-none hidden h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700 sm:block"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
