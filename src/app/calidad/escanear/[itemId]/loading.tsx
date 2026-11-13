import { HojaEsqueleto, PaginaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de la ficha de un mueble escaneado.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-3xl">
      <TituloEsqueleto ancho="w-56" />
      <HojaEsqueleto alto="h-72" />
    </PaginaEsqueleto>
  );
}
