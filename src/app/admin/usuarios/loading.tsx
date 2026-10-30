import { Bloque, FilasEsqueleto, PaginaEsqueleto } from "@/components/esqueleto";

// Esqueleto de Usuarios: título con el recuento por rol, el formulario de alta, los filtros y la tabla.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <div className="flex flex-col gap-3">
        <Bloque className="h-9 w-40" />
        <Bloque className="h-4 w-96 max-w-full" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bloque key={i} className="h-7 w-28 rounded-full" />
          ))}
        </div>
      </div>
      <Bloque className="h-80 rounded-xl" />
      <div className="flex items-center gap-3">
        <Bloque className="h-9 w-40" />
        <Bloque className="h-9 w-40" />
        <Bloque className="ml-auto h-7 w-32 rounded-full" />
      </div>
      <FilasEsqueleto filas={5} avatar />
    </PaginaEsqueleto>
  );
}
