import { PaginaEsqueleto, TablaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de las pantallas de Administración: título y tabla.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <TituloEsqueleto ayuda={false} ancho="w-48" />
      <TablaEsqueleto columnas={5} filas={6} />
    </PaginaEsqueleto>
  );
}
