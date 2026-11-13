import { Bloque, PaginaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto del carrito: título, barra de acciones y un PM con sus ítems.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <TituloEsqueleto ancho="w-72" />
      <Bloque className="h-14 rounded-xl" />
      <Bloque className="h-6 w-32" />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="h-12 border-b border-slate-100 bg-slate-50" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-4 last:border-0">
            <div className="flex flex-1 flex-col gap-2">
              <Bloque className="h-5 w-48 max-w-full" />
              <Bloque className="h-3 w-2/3" />
            </div>
            <Bloque className="h-6 w-24 rounded-full" />
            <Bloque className="h-11 w-11" />
          </div>
        ))}
      </div>
    </PaginaEsqueleto>
  );
}
