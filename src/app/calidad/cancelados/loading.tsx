import { Bloque, PaginaEsqueleto, TarjetasListaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Cancelados en Calidad: título y sus dos secciones.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <TituloEsqueleto ayuda={false} ancho="w-44" />
      <Bloque className="h-4 w-64" />
      <TarjetasListaEsqueleto n={2} />
      <Bloque className="h-4 w-72" />
      <TarjetasListaEsqueleto n={2} />
    </PaginaEsqueleto>
  );
}
