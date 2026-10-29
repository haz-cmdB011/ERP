import {
  Bloque,
  CuadriculaEsqueleto,
  NumerosEsqueleto,
  PaginaEsqueleto,
  PestanasEsqueleto,
  TituloEsqueleto,
} from "@/components/esqueleto";

// Esqueleto del Taller: pestañas, título con su selector de vista, números y tarjetas por equipo.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-6xl">
      <PestanasEsqueleto n={2} />
      <TituloEsqueleto ancho="w-32" derecha={<Bloque className="h-12 w-52" />} />
      <NumerosEsqueleto />
      <CuadriculaEsqueleto n={3} alto="h-44" />
    </PaginaEsqueleto>
  );
}
