import { Bloque, CuadriculaEsqueleto, PaginaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Equipos: título con su botón, el resumen con "Nuevo equipo" y las tarjetas de equipos.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <TituloEsqueleto ancho="w-36" derecha={<Bloque className="h-10 w-40" />} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bloque key={i} className="h-14 rounded-xl" />
          ))}
        </div>
        <Bloque className="h-11 w-40" />
      </div>
      <CuadriculaEsqueleto n={8} columnas="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" alto="h-28" />
    </PaginaEsqueleto>
  );
}
