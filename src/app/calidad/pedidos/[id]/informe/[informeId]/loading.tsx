import { HojaEsqueleto, MigasEsqueleto, PaginaEsqueleto } from "@/components/esqueleto";

// Esqueleto del informe de Calidad: migas y la hoja del informe.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-3xl">
      <MigasEsqueleto />
      <HojaEsqueleto alto="h-[34rem]" />
    </PaginaEsqueleto>
  );
}
