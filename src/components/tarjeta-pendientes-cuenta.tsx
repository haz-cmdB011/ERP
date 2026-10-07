"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  COOKIE_PENDIENTES_OCULTOS,
  TODOS_LOS_PENDIENTES,
  valorOculto,
  type PendienteCuenta,
} from "@/lib/cuenta/pendientes";

export interface PendienteMostrado {
  id: PendienteCuenta;
  titulo: string;
  detalle: string;
}

// Tarjeta "Completa tu cuenta" del inicio de cada área: lo que falta del perfil
// y de la verificación en dos pasos, cada uno con un enlace a Mi perfil. Se
// puede ocultar (queda recordado en una cookie, así el servidor ya no la dibuja
// y no parpadea); reaparece solo si surge un pendiente nuevo.
export default function TarjetaPendientesCuenta({
  pendientes,
  href,
}: {
  pendientes: PendienteMostrado[];
  href: string;
}) {
  const router = useRouter();
  const total = TODOS_LOS_PENDIENTES.length;
  const hechos = total - pendientes.length;

  function ocultar() {
    const seguro = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${COOKIE_PENDIENTES_OCULTOS}=${valorOculto(pendientes.map((p) => p.id))}; max-age=${
      60 * 60 * 24 * 180
    }; path=/; samesite=lax${seguro}`;
    router.refresh();
  }

  return (
    <section
      aria-label="Completa tu cuenta"
      className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">
            Completa tu cuenta ({hechos} de {total})
          </h2>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={hechos}
            aria-label="Pasos de la cuenta completados"
            className="mt-2 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-white"
          >
            <div
              className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
              style={{ width: `${(hechos / total) * 100}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={ocultar}
          className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
        >
          Ocultar
        </button>
      </div>
      <ul className="mt-3 flex flex-col divide-y divide-brand-100">
        {pendientes.map((p) => (
          <li key={p.id}>
            <Link
              href={href}
              className="group flex min-h-11 items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block font-medium text-slate-900 group-hover:text-brand-700 group-hover:underline">
                  {p.titulo}
                </span>
                <span className="block text-xs text-slate-500">{p.detalle}</span>
              </span>
              <span className="shrink-0 text-slate-400 group-hover:text-brand-700" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
