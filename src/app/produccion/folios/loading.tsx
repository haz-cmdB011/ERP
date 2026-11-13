import { Bloque, ChipsEsqueleto, PaginaEsqueleto, PestanasEsqueleto, TablaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Folios de producción: pestañas, título, buscador, estados y tabla.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <PestanasEsqueleto n={2} />
      <TituloEsqueleto />
      <div className="flex flex-wrap items-center gap-2">
        <Bloque className="h-10 w-full max-w-sm" />
        <Bloque className="h-10 w-24" />
      </div>
      <ChipsEsqueleto n={4} ancho="w-24" alto="h-8" />
      <TablaEsqueleto columnas={6} filas={6} />
    </PaginaEsqueleto>
  );
}
