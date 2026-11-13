import { Bloque, PaginaEsqueleto, TarjetasListaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Entregas de Producción: título con su recuento y las entregas en dos columnas.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <TituloEsqueleto derecha={<Bloque className="h-7 w-40 rounded" />} />
      <TarjetasListaEsqueleto n={6} columnas="md:grid-cols-2" />
    </PaginaEsqueleto>
  );
}
