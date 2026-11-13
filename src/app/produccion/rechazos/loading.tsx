import { Bloque, PaginaEsqueleto, PestanasEsqueleto, TarjetasListaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Rechazos de Calidad: pestañas, título y las piezas por reasignar.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <PestanasEsqueleto n={2} />
      <TituloEsqueleto />
      <Bloque className="h-5 w-40" />
      <TarjetasListaEsqueleto n={3} />
    </PaginaEsqueleto>
  );
}
