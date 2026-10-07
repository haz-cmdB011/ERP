"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  COOKIE_FILTRO_REGISTRO,
  etiquetaFiltroRegistro,
  valorFiltroRegistro,
  type FiltroRegistroGuardado,
} from "@/lib/estimaciones/filtros-registro";

const SEIS_MESES = 60 * 60 * 24 * 180;

function escribirCookie(valor: string, segundos: number) {
  const seguro = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${COOKIE_FILTRO_REGISTRO}=${encodeURIComponent(valor)}; max-age=${segundos}; path=/; samesite=lax${seguro}`;
}

// Recuerda el último filtro (tipo y contratista) del Registro. Con un filtro
// puesto lo guarda; sin filtros ofrece volver al último con un enlace. No lo
// aplica solo: un filtro que no se ve haría pensar que faltan recibos.
export default function FiltroRegistroRecordado({
  actual,
  guardado,
  href,
}: {
  actual: FiltroRegistroGuardado;
  guardado: FiltroRegistroGuardado | null;
  href: string;
}) {
  const router = useRouter();
  const hayActual = !!(actual.tipo || actual.contratista);
  const valorActual = valorFiltroRegistro(actual);

  useEffect(() => {
    if (!hayActual) return;
    try {
      escribirCookie(valorActual, SEIS_MESES);
    } catch {
      // Sin cookies: el registro funciona igual, solo que no recuerda.
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
        {etiquetaFiltroRegistro(guardado)} →
      </Link>
      <button type="button" onClick={olvidar} className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
        Olvidar
      </button>
    </p>
  );
}
