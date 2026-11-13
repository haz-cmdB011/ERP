import { BuscadorEsqueleto, ChipsEsqueleto, ClientesEsqueleto, PaginaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Pedidos en Calidad: saludo, título, buscador, año, estados y clientes.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <TituloEsqueleto ayuda={false} ancho="w-64" />
      <BuscadorEsqueleto completo />
      <ChipsEsqueleto n={3} ancho="w-20" alto="h-8" />
      <ChipsEsqueleto n={3} ancho="w-28" />
      <ClientesEsqueleto />
    </PaginaEsqueleto>
  );
}
