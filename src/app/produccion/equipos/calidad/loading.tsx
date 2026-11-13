import { Bloque, MigasEsqueleto, PaginaEsqueleto, TablaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Calidad por equipo: migas, título con su botón y la tabla.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <MigasEsqueleto tramos={2} />
      <TituloEsqueleto derecha={<Bloque className="h-10 w-24" />} />
      <TablaEsqueleto columnas={6} filas={5} />
    </PaginaEsqueleto>
  );
}
