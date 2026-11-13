import { Bloque, PaginaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Recibos por llegar: título y las dos áreas con sus muebles.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <TituloEsqueleto />
      <div className="grid gap-4 md:grid-cols-2">
        <Bloque className="h-72 rounded-xl" />
        <Bloque className="h-72 rounded-xl" />
      </div>
    </PaginaEsqueleto>
  );
}
