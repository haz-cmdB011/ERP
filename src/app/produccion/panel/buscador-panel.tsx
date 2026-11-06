"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

// Busca mientras se escribe (PM, O.T., modelo, descripción, proyecto o cliente): cambia ?q= de la
// dirección sin botón, conservando los demás filtros (`otros`, ya armados en el servidor).
export default function BuscadorPanel({ inicial, otros }: { inicial: string; otros: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const [texto, setTexto] = useState(inicial);
  const [pendiente, iniciar] = useTransition();
  const primera = useRef(true);

  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const t = setTimeout(() => {
      const p = new URLSearchParams(otros);
      const q = texto.trim();
      if (q) p.set("q", q);
      else p.delete("q");
      const s = p.toString();
      iniciar(() => router.replace(s ? `${ruta}?${s}` : ruta, { scroll: false }));
    }, 350);
    return () => clearTimeout(t);
  }, [texto, otros, ruta, router]);

  return (
    <label className="relative block min-w-0 flex-1 sm:max-w-sm">
      <span className="sr-only">Buscar muebles</span>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </svg>
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar PM, O.T. o modelo"
        className={`w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 outline-none transition-opacity focus:border-slate-400 focus:ring-2 focus:ring-brand-300 ${
          pendiente ? "opacity-60" : ""
        }`}
      />
    </label>
  );
}
