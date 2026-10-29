import { AccesosEsqueleto, PaginaEsqueleto, SaludoEsqueleto, TituloEsqueleto } from "@/components/esqueleto";

// Esqueleto del Generador de Recibos: saludo, título y las áreas de maquila.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-5xl">
      <SaludoEsqueleto />
      <TituloEsqueleto ayuda={false} ancho="w-64" />
      <AccesosEsqueleto n={3} />
    </PaginaEsqueleto>
  );
}
