import { MigasEsqueleto, PaginaEsqueleto, TablaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de una O.T. en Planeación: migas, título y la tabla de sus PM.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <MigasEsqueleto tramos={2} />
      <TituloEsqueleto ancho="w-48" />
      <TablaEsqueleto columnas={5} filas={4} />
    </PaginaEsqueleto>
  );
}
