import { Bloque, PaginaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto del panel de asignación: título, estados, buscador y las O.T. (cerradas) en una lista.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <TituloEsqueleto ancho="w-64" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bloque key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Bloque className="h-10 min-w-48 flex-1" />
        <Bloque className="h-10 w-28" />
        <Bloque className="h-10 w-24" />
      </div>
      <div className="flex gap-2">
        <Bloque className="h-10 w-32" />
        <Bloque className="h-10 w-32" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
            <Bloque className="h-4 w-4" />
            <Bloque className="h-5 w-28" />
            <Bloque className="h-4 w-40" />
            <Bloque className="ml-auto h-5 w-32 rounded-full" />
          </div>
        ))}
      </div>
    </PaginaEsqueleto>
  );
}
