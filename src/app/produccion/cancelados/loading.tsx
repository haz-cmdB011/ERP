import { Bloque, PaginaEsqueleto, PestanasEsqueleto, TarjetasListaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Cancelados y eliminados: pestañas, título y sus dos secciones de tarjetas.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <PestanasEsqueleto n={2} />
      <TituloEsqueleto />
      <Bloque className="h-5 w-56" />
      <TarjetasListaEsqueleto n={2} />
      <Bloque className="h-5 w-64" />
      <TarjetasListaEsqueleto n={2} />
    </PaginaEsqueleto>
  );
}
