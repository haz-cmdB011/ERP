import { AccesosEsqueleto, Bloque, PaginaEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto del inicio de Estimaciones: saludo, título, "Recibos por llegar" y los accesos.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <TituloEsqueleto ayuda={false} ancho="w-48" />
      <Bloque className="h-52 rounded-xl" />
      <AccesosEsqueleto n={3} />
    </PaginaEsqueleto>
  );
}
