import { Bloque, MigasEsqueleto, PaginaEsqueleto, TablaEsqueleto } from "@/components/esqueleto";

// Esqueleto del despiece: migas, encabezado del mueble y la tabla de partes.
export default function Loading() {
  return (
    <PaginaEsqueleto ancho="max-w-4xl">
      <MigasEsqueleto tramos={3} />
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <Bloque className="h-3 w-40" />
        <Bloque className="h-8 w-64" />
        <Bloque className="h-4 w-80 max-w-full" />
      </div>
      <TablaEsqueleto columnas={5} filas={5} />
    </PaginaEsqueleto>
  );
}
