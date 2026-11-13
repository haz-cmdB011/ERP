import { HojaEsqueleto, PaginaEsqueleto } from "@/components/esqueleto";

// Esqueleto de las etiquetas QR: una hoja carta.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-4xl">
      <HojaEsqueleto alto="h-[36rem]" />
    </PaginaEsqueleto>
  );
}
