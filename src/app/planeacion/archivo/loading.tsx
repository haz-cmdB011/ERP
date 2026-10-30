import { MigasEsqueleto, PaginaEsqueleto, PestanasEsqueleto, TarjetasListaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto del Archivo de Planeación: migas, título, pestañas y sus tarjetas.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <MigasEsqueleto tramos={2} />
      <TituloEsqueleto ancho="w-32" />
      <PestanasEsqueleto n={2} />
      <TarjetasListaEsqueleto n={3} />
    </PaginaEsqueleto>
  );
}
