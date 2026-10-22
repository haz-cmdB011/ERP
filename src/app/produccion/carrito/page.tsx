import type { Metadata } from "next";
import CarritoVista from "./carrito-vista";

export const metadata: Metadata = { title: "Carrito" };

export default function CarritoProduccionPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pb-24 sm:p-6 sm:pb-24">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Carrito de producción</h1>
        <p className="mt-1 text-sm text-slate-600">
          Aquí se juntan los muebles y componentes que marcaste en cualquier PM u O.T. Desde aquí los
          liberas a producción y los asignas a los equipos de maquila.
        </p>
      </div>
      <CarritoVista />
    </main>
  );
}
