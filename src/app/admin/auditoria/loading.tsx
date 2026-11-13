import { Bloque, ChipsEsqueleto, PaginaEsqueleto, TablaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Auditoría: título, buscador, filtros y tabla.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <TituloEsqueleto ayuda={false} ancho="w-40" />
      <div className="flex gap-2">
        <Bloque className="h-10 flex-1" />
        <Bloque className="h-10 w-24" />
      </div>
      <ChipsEsqueleto n={5} ancho="w-24" alto="h-8" />
      <TablaEsqueleto columnas={6} filas={8} />
    </PaginaEsqueleto>
  );
}
