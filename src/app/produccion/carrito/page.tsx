import type { Metadata } from "next";
import CarritoVista from "./carrito-vista";

export const metadata: Metadata = { title: "Carrito" };

export default function CarritoProduccionPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pb-24 sm:p-6 sm:pb-24">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Carrito</h1>
      <CarritoVista />
    </main>
  );
}
