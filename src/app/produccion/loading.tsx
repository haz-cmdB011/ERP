import { Bloque, ChipsEsqueleto, ClientesEsqueleto, PaginaEsqueleto, SaludoEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Pedidos en Producción: saludo, título, buscador de O.T., estados y clientes.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <SaludoEsqueleto />
      <TituloEsqueleto ancho="w-40" />
      <Bloque className="h-12 rounded-xl" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ChipsEsqueleto n={3} ancho="w-28" />
        <Bloque className="h-4 w-32" />
      </div>
      <ClientesEsqueleto />
    </PaginaEsqueleto>
  );
}
