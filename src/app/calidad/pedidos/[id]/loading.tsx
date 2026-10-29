import {
  Bloque,
  MigasEsqueleto,
  PaginaEsqueleto,
  TablaMueblesEsqueleto,
  TituloEsqueleto,
} from "@/components/esqueleto";

// Esqueleto del pedido en Calidad: migas, título, versión, buscador y los muebles, cada uno en su recuadro
// con su tabla.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <MigasEsqueleto />
      <TituloEsqueleto ancho="w-48" />
      <Bloque className="h-7 w-24 rounded-full" />
      <Bloque className="h-10 w-full max-w-xs" />
      {Array.from({ length: 2 }).map((_, i) => (
        <TablaMueblesEsqueleto key={i} filas={2} casilla={false} acciones={false} />
      ))}
    </PaginaEsqueleto>
  );
}
