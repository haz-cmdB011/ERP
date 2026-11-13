import { FormularioEsqueleto, PaginaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Mi cuenta: título y sus datos.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-3xl">
      <TituloEsqueleto ayuda={false} ancho="w-40" />
      <FormularioEsqueleto campos={4} />
    </PaginaEsqueleto>
  );
}
