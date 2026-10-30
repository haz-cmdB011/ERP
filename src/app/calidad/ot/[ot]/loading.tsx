import { Bloque, MigasEsqueleto, PaginaEsqueleto, TablaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de una O.T. en Calidad: migas, título y la tabla de sus PM con sus recuentos.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <MigasEsqueleto tramos={2} />
      <TituloEsqueleto ayuda ancho="w-48" />
      <Bloque className="h-4 w-52" />
      <TablaEsqueleto columnas={9} filas={4} />
    </PaginaEsqueleto>
  );
}
