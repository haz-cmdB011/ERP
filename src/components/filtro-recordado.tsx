"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  COOKIE_FILTRO_PEDIDOS,
  etiquetaFiltroGuardado,
  valorFiltroGuardado,
  type FiltroGuardado,
} from "@/lib/planeacion/filtro-guardado";

const SEIS_MESES = 60 * 60 * 24 * 180;

function escribirCookie(valor: string, segundos: number) {
  const seguro = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${COOKIE_FILTRO_PEDIDOS}=${encodeURIComponent(valor)}; max-age=${segundos}; path=/; samesite=lax${seguro}`;
}

// Recuerda el último filtro (año y cliente) de la lista de Pedidos. Con un
// filtro puesto lo guarda; sin filtros, ofrece volver al último con un enlace.
// No lo aplica solo: un filtro que no se ve haría pensar que faltan O.T.
export default function FiltroRecordado({
  actual,
  guardado,
  href,
}: {
  actual: FiltroGuardado;
  guardado: FiltroGuardado | null;
  href: string;
}) {
  const router = useRouter();
  const hayActual = !!(actual.anio || actual.cliente);
  const valorActual = valorFiltroGuardado(actual);

  useEffect(() => {
    if (!hayActual) return;
    try {
      escribirCookie(valorActual, SEIS_MESES);
    } catch {
      // Sin cookies: la lista funciona igual, solo que no recuerda.
    }
  }, [hayActual, valorActual]);

  if (hayActual || !guardado) return null;

  function olvidar() {
    escribirCookie("", 0);
    router.refresh();
  }

  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Último filtro</span>
      <Link
        href={href}
        className="rounded-full border border-brand-300 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 transition-colors hover:bg-brand-100"
      >
        {etiquetaFiltroGuardado(guardado)} →
      </Link>
      <button type="button" onClick={olvidar} className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
        Olvidar
      </button>
    </p>
  );
}
