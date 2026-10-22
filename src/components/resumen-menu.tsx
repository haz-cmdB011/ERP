"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { TarjetaResumen } from "./resumen-inicio";

// Los números de resumen de cada área (O.T. vigentes, por evaluar...) ya no ocupan la
// pantalla: viven en el menú de las tres rayas. La pantalla de inicio los "registra"
// (ResumenEnMenu) y el menú los dibuja (ResumenDelMenu). El layout del área envuelve
// las dos cosas en el mismo ResumenMenuProvider.

// Una acción de la pantalla abierta que vive en el menú en vez de ocupar espacio en la pantalla
// (ej. "Papelera (3)" en un pedido). Mientras la pantalla esté abierta, aparece en el menú.
export interface AccionMenu {
  etiqueta: string;
  alHacer: () => void;
  // Número al lado de la etiqueta ("Papelera 3"): se muestra en un globo.
  conteo?: number;
  peligro?: boolean;
  // Icono de trazo (los `d` de los <path> de un viewBox 24x24).
  icono?: string[];
}

interface Contexto {
  tarjetas: TarjetaResumen[];
  registrar: (tarjetas: TarjetaResumen[]) => void;
  acciones: AccionMenu[];
  registrarAcciones: (acciones: AccionMenu[]) => void;
}

const ResumenMenuContexto = createContext<Contexto>({
  tarjetas: [],
  registrar: () => {},
  acciones: [],
  registrarAcciones: () => {},
});

export function ResumenMenuProvider({ children }: { children: React.ReactNode }) {
  const [tarjetas, setTarjetas] = useState<TarjetaResumen[]>([]);
  const registrar = useCallback((nuevas: TarjetaResumen[]) => setTarjetas(nuevas), []);
  const [acciones, setAcciones] = useState<AccionMenu[]>([]);
  const registrarAcciones = useCallback((nuevas: AccionMenu[]) => setAcciones(nuevas), []);
  const valor = useMemo(
    () => ({ tarjetas, registrar, acciones, registrarAcciones }),
    [tarjetas, registrar, acciones, registrarAcciones]
  );
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

// Se pone en una pantalla: no dibuja nada, deja sus acciones en el menú mientras esté abierta. Las
// funciones cambian en cada render, así que el registro se rehace solo cuando cambia lo visible
// (etiqueta, número, icono) y cada acción llama siempre a la función más reciente.
export function AccionesEnMenu({ acciones }: { acciones: AccionMenu[] }) {
  const { registrarAcciones } = useContext(ResumenMenuContexto);
  const ultimas = useRef(acciones);
  useEffect(() => {
    ultimas.current = acciones;
  });
  const clave = JSON.stringify(acciones.map((a) => ({ ...a, alHacer: undefined })));
  useEffect(() => {
    const visibles = JSON.parse(clave) as Omit<AccionMenu, "alHacer">[];
    registrarAcciones(visibles.map((a, i) => ({ ...a, alHacer: () => ultimas.current[i]?.alHacer() })));
    return () => registrarAcciones([]);
  }, [clave, registrarAcciones]);
  return null;
}

// Las acciones de la pantalla, dentro del menú.
export function AccionesDelMenu({ alElegir }: { alElegir: () => void }) {
  const { acciones } = useContext(ResumenMenuContexto);
  if (acciones.length === 0) return null;
  return (
    <section aria-label="Acciones de esta pantalla" className="mt-3 border-t border-slate-200 pt-3">
      <ul className="flex flex-col gap-0.5">
        {acciones.map((a) => (
          <li key={a.etiqueta}>
            <button
              type="button"
              onClick={() => {
                alElegir();
                a.alHacer();
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                a.peligro ? "text-rose-700 hover:bg-rose-50" : "text-slate-800 hover:bg-slate-100"
              }`}
            >
              {a.icono && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                >
                  {a.icono.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
              )}
              <span className="min-w-0 flex-1">{a.etiqueta}</span>
              {a.conteo !== undefined && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                  {a.conteo}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
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
