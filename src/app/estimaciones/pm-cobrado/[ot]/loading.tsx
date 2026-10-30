import { ChipsEsqueleto, PaginaEsqueleto, TablaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de PM contra cobrado de una O.T.: título, filtros y la tabla de modelos.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <TituloEsqueleto ancho="w-48" />
      <ChipsEsqueleto n={4} ancho="w-28" alto="h-8" />
      <TablaEsqueleto columnas={8} filas={6} />
    </PaginaEsqueleto>
  );
}
