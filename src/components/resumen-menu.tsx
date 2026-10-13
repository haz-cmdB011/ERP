"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { TarjetaResumen } from "./resumen-inicio";

// Los números de resumen de cada área (O.T. vigentes, por evaluar...) ya no ocupan la
// pantalla: viven en el menú de las tres rayas. La pantalla de inicio los "registra"
// (ResumenEnMenu) y el menú los dibuja (ResumenDelMenu). El layout del área envuelve
// las dos cosas en el mismo ResumenMenuProvider.

interface Contexto {
  tarjetas: TarjetaResumen[];
  registrar: (tarjetas: TarjetaResumen[]) => void;
}

const ResumenMenuContexto = createContext<Contexto>({ tarjetas: [], registrar: () => {} });

export function ResumenMenuProvider({ children }: { children: React.ReactNode }) {
  const [tarjetas, setTarjetas] = useState<TarjetaResumen[]>([]);
  const registrar = useCallback((nuevas: TarjetaResumen[]) => setTarjetas(nuevas), []);
  const valor = useMemo(() => ({ tarjetas, registrar }), [tarjetas, registrar]);
  return <ResumenMenuContexto.Provider value={valor}>{children}</ResumenMenuContexto.Provider>;
}

// Algo que alguien tiene que atender: una tarjeta resaltada con valor, o con alerta.
export function hayPendientes(tarjetas: TarjetaResumen[]): boolean {
  return tarjetas.some((t) => !!t.alerta || (t.tono === "atencion" && t.valor > 0));
}

export function useHayPendientesEnMenu(): boolean {
  return hayPendientes(useContext(ResumenMenuContexto).tarjetas);
}

// Se pone en la pantalla de inicio donde antes iba ResumenInicio: no dibuja nada, deja las
// tarjetas en el menú mientras la pantalla esté abierta.
export function ResumenEnMenu({ tarjetas }: { tarjetas: TarjetaResumen[] }) {
  const { registrar } = useContext(ResumenMenuContexto);
  const clave = JSON.stringify(tarjetas);
  useEffect(() => {
    registrar(JSON.parse(clave) as TarjetaResumen[]);
    return () => registrar([]);
  }, [clave, registrar]);
  return null;
}

// Lo que se ve dentro del menú: una fila por número, con su enlace si lo tiene.
export function ResumenDelMenu({ alElegir }: { alElegir: () => void }) {
  const { tarjetas } = useContext(ResumenMenuContexto);
  if (tarjetas.length === 0) return null;
  return (
    <section aria-label="Resumen" className="mt-3 border-t border-slate-200 pt-3">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Resumen</p>
      <ul className="flex flex-col gap-0.5">
        {tarjetas.map((t) => {
          const atencion = t.valor > 0 && t.tono === "atencion";
          const cuerpo = (
            <>
              <span
                className={`w-9 shrink-0 text-right text-xl font-semibold tabular-nums ${
                  atencion ? "text-brand-800" : t.valor > 0 ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {t.valor}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">{t.etiqueta}</span>
                {t.detalle && <span className="block text-xs text-slate-500">{t.detalle}</span>}
                {t.alerta && <span className="block text-xs font-medium text-amber-700">⚠ {t.alerta}</span>}
              </span>
            </>
          );
          const clase = "flex items-center gap-3 rounded-xl px-3 py-2";
          return (
            <li key={t.etiqueta}>
              {t.href ? (
                <Link href={t.href} onClick={alElegir} className={`${clase} transition-colors hover:bg-slate-100`}>
                  {cuerpo}
                </Link>
              ) : (
                <div className={clase}>{cuerpo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
