"use client";

import Link from "next/link";
import { useMemo } from "react";
import { filasCarrito } from "@/lib/produccion/carrito";
import { useCarrito } from "@/lib/produccion/carrito-navegador";

// Acceso al carrito desde cualquier pantalla de Producción, con cuántos muebles lleva
// (sus componentes viajan con ellos y no cuentan aparte).
export default function BotonCarrito() {
  const todos = useCarrito();
  const items = useMemo(() => filasCarrito(todos), [todos]);
  if (items.length === 0) return null;
  return (
    <Link
      href="/produccion/carrito"
      className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-on-brand shadow-lg transition-colors hover:bg-brand-400"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" />
      </svg>
      Carrito
      <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-slate-900">
        {items.length}
      </span>
    </Link>
  );
}
