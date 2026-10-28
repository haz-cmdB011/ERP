"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import Chevron from "@/components/chevron";

export interface TarjetaResumen {
  valor: number;
  etiqueta: string;
  // Texto corto que aclara qué se cuenta.
  detalle?: string;
  // Lista a la que lleva la tarjeta, ya filtrada.
  href?: string;
  // "atencion" resalta lo que alguien tiene que hacer; "suave" lo informativo.
  tono?: "atencion" | "suave";
  // Algo lleva días esperando (p. ej. "3 con 2 días o más"): se marca en ámbar.
  alerta?: string | null;
}

// Fila de números al inicio de cada área: qué hay pendiente y un clic para
// verlo. Con valor 0 la tarjeta se apaga (no hay nada que hacer).
// `despliegues` (por etiqueta de tarjeta) convierte esa tarjeta en un botón que abre su contenido
// en una franja a todo lo ancho, bajo las tarjetas, en lugar de llevar a otra pantalla.
export default function ResumenInicio({
  tarjetas,
  despliegues = {},
}: {
  tarjetas: TarjetaResumen[];
  despliegues?: Record<string, ReactNode>;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const idPanel = useId();
  if (tarjetas.length === 0) return null;
  return (
    <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tarjetas.map((t) => {
        const activa = t.valor > 0 && t.tono === "atencion";
        const cuerpo = (
          <>
            <span
              className={`text-3xl font-semibold tabular-nums tracking-tight ${
                activa ? "text-brand-800" : t.valor > 0 ? "text-slate-900" : "text-slate-500"
              }`}
            >
              {t.valor.toLocaleString("es-MX")}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900">{t.etiqueta}</span>
              {t.detalle && <span className="block text-xs text-slate-500">{t.detalle}</span>}
              {t.alerta && (
                <span className="mt-0.5 block text-xs font-medium text-amber-700">⚠ {t.alerta}</span>
              )}
            </span>
          </>
        );
        const base = `flex h-full items-center gap-4 rounded-xl border bg-white p-4 ${
          t.alerta ? "border-amber-300 ring-1 ring-amber-200" : activa ? "border-brand-300 ring-1 ring-brand-200" : "border-slate-200"
        }`;
        const despliegue = despliegues[t.etiqueta];
        const estaAbierta = abierta === t.etiqueta;
        const tarjeta = despliegue ? (
          <button
            type="button"
            onClick={() => setAbierta(estaAbierta ? null : t.etiqueta)}
            aria-expanded={estaAbierta}
            aria-controls={idPanel}
            className={`${base} group w-full text-left transition-colors hover:border-brand-400 ${
              estaAbierta ? "border-brand-400" : ""
            }`}
          >
            {cuerpo}
            <Chevron abierto={estaAbierta} className="ml-auto h-4 w-4 text-slate-500" />
          </button>
        ) : t.href ? (
          <Link
            href={t.href}
            className={`${base} group transition-colors hover:border-brand-400`}
          >
            {cuerpo}
          </Link>
        ) : (
          <div className={base}>
            {cuerpo}
          </div>
        );
        return <div key={t.etiqueta}>{tarjeta}</div>;
      })}
      {abierta && despliegues[abierta] && (
        <div id={idPanel} className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2 lg:col-span-4">
          {despliegues[abierta]}
        </div>
      )}
    </section>
  );
}
