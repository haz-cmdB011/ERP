import { Bloque, BuscadorEsqueleto, ChipsEsqueleto, ClientesEsqueleto, PaginaEsqueleto, SaludoEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto de Pedidos en Planeación: saludo, título, acceso a cargar Excel, buscador, año, estados y clientes.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <SaludoEsqueleto />
      <TituloEsqueleto ancho="w-40" />
      <Bloque className="h-14 rounded-xl" />
      <BuscadorEsqueleto completo />
      <ChipsEsqueleto n={3} ancho="w-20" alto="h-8" />
      <ChipsEsqueleto n={3} ancho="w-28" />
      <ClientesEsqueleto />
    </PaginaEsqueleto>
  );
}
