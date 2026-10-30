import { HojaEsqueleto, MigasEsqueleto, PaginaEsqueleto } from "@/components/esqueleto";

// Esqueleto del recibo: migas y su hoja.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-3xl">
      <MigasEsqueleto />
      <HojaEsqueleto alto="h-[34rem]" />
    </PaginaEsqueleto>
  );
}
