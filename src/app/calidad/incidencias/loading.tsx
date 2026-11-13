import { Bloque, PaginaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de No conformidades: título con "Nuevo reporte", periodo, apartados, números y comparación.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-7xl">
      <TituloEsqueleto ayuda={false} ancho="w-72" derecha={<Bloque className="h-10 w-32" />} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Bloque className="h-10 w-64 rounded-xl" />
          <Bloque className="h-9 w-96 max-w-full rounded-full" />
        </div>
        <Bloque className="h-10 w-36" />
      </div>
      <Bloque className="h-12 w-full max-w-lg rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bloque key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Bloque className="h-64 rounded-xl" />
    </PaginaEsqueleto>
  );
}
