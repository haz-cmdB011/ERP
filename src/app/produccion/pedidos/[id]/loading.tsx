import {
  Bloque,
  BuscadorEsqueleto,
  MigasEsqueleto,
  PaginaEsqueleto,
  PestanasEsqueleto,
  TablaMueblesEsqueleto,
  TituloEsqueleto,
} from "@/components/esqueleto";

// Esqueleto del PM en Producción: migas, título, pestaña, buscador, barra de acciones y la tabla de
// muebles con su miniatura.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <MigasEsqueleto />
      <TituloEsqueleto ancho="w-48" />
      <PestanasEsqueleto n={1} />
      <BuscadorEsqueleto />
      <Bloque className="h-14 rounded-xl" />
      <TablaMueblesEsqueleto filas={6} />
    </PaginaEsqueleto>
  );
}
