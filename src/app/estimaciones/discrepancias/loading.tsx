import { ChipsEsqueleto, PaginaEsqueleto, TablaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Discrepancias con el PM: título, filtros y tabla.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <TituloEsqueleto ayuda={false} ancho="w-64" />
      <ChipsEsqueleto n={4} ancho="w-24" alto="h-8" />
      <TablaEsqueleto columnas={6} filas={6} />
    </PaginaEsqueleto>
  );
}
