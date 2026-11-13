import { Bloque, MigasEsqueleto, PaginaEsqueleto, PestanasEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Asignar a equipos: migas, título, pestañas y los muebles con sus anillos de avance.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <MigasEsqueleto />
      <TituloEsqueleto ancho="w-72" />
      <PestanasEsqueleto n={2} />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3">
          <Bloque className="h-14 w-14 shrink-0" />
          <div className="flex w-56 flex-col gap-2">
            <Bloque className="h-5 w-24 rounded-full" />
            <Bloque className="h-4 w-32" />
          </div>
          <div className="hidden flex-1 items-center justify-between gap-4 sm:flex">
            <Bloque className="h-14 w-14 rounded-full" />
            <Bloque className="h-0.5 flex-1" />
            <Bloque className="h-14 w-14 rounded-full" />
          </div>
        </div>
      ))}
    </PaginaEsqueleto>
  );
}
