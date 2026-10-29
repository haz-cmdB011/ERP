import { HojaEsqueleto, PaginaEsqueleto } from "@/components/esqueleto";

// Esqueleto de la hoja de viajero: una hoja en blanco.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-4xl">
      <HojaEsqueleto alto="h-[36rem]" />
    </PaginaEsqueleto>
  );
}
