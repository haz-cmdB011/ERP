import { FormularioEsqueleto, PaginaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto del generador de recibos de armado: título y su formulario.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <TituloEsqueleto ancho="w-64" />
      <FormularioEsqueleto campos={6} />
    </PaginaEsqueleto>
  );
}
