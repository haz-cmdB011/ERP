import {
  BuscadorEsqueleto,
  MigasEsqueleto,
  PaginaEsqueleto,
  PestanasEsqueleto,
  TablaMueblesEsqueleto,
  TituloEsqueleto,
} from "@/components/esqueleto";

// Esqueleto del PM en Planeación: migas, título, pestañas, buscador y la tabla de muebles.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <MigasEsqueleto />
      <TituloEsqueleto ancho="w-48" />
      <PestanasEsqueleto n={2} />
      <BuscadorEsqueleto botones={2} />
      <TablaMueblesEsqueleto filas={6} acciones={false} />
    </PaginaEsqueleto>
  );
}
