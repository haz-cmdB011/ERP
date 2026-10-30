import { MigasEsqueleto, PaginaEsqueleto, TarjetasPmEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de una O.T. en Producción: migas, título y los PM en tarjetas con su avance.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <MigasEsqueleto tramos={2} />
      <TituloEsqueleto ancho="w-48" />
      <TarjetasPmEsqueleto n={4} />
    </PaginaEsqueleto>
  );
}
