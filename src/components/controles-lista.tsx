import Link from "next/link";
import Chevron from "@/components/chevron";
import { hrefListaPedidos } from "@/lib/planeacion/lista-ordenes-trabajo";
import { ESTADOS_LISTA, type EstadoLista } from "@/lib/planeacion/vista-lista";

// Filtros que la lista conserva al cambiar de estado.
export interface ParamsLista {
  q?: string;
  anio?: string;
  // Solo si no es el de por omisión (ver paramEstadoLista).
  estado?: string;
}

// Activas / Terminadas / Todas con cuántas O.T. hay en cada una.
export function SelectorEstado({
  base,
  actual,
  cuentas,
  params,
  hayBusqueda,
}: {
  base: string;
  actual: EstadoLista;
  cuentas: Record<EstadoLista, number>;
  params: Omit<ParamsLista, "estado">;
  hayBusqueda: boolean;
}) {
  const porOmision: EstadoLista = hayBusqueda ? "todos" : "activos";
  return (
    <div className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
      {ESTADOS_LISTA.map(({ valor, etiqueta }) => (
        <Link
          key={valor}
          href={hrefListaPedidos(base, { ...params, estado: valor === porOmision ? undefined : valor })}
          aria-current={valor === actual ? "true" : undefined}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors pointer-coarse:py-2.5 ${
            valor === actual ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {etiqueta} <span className="text-xs font-normal text-slate-500">{cuentas[valor]}</span>
        </Link>
      ))}
    </div>
  );
}

// Un cliente con sus O.T., plegable. Usa <details>: abre y cierra sin JavaScript.
export function DesplegableCliente({
  cliente,
  total,
  abierto,
  children,
}: {
  cliente: string;
  total: number;
  abierto: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={abierto} className="group/cliente rounded-xl border border-slate-200 bg-white/50">
      <summary className="flex cursor-pointer select-none list-none items-center gap-2 rounded-xl px-4 py-3 transition-colors hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <Chevron abierto={false} className="h-4 w-4 text-slate-500 group-open/cliente:rotate-90" />
        <span className="font-semibold text-slate-900">{cliente}</span>
        <span className="text-xs text-slate-500">
          {total} O.T.
        </span>
      </summary>
      <div className="border-t border-slate-100 p-3">{children}</div>
    </details>
  );
}
