"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";

export interface OpcionBusqueda {
  ot: string | null;
  pm: string;
  pedidoId: string;
  cliente: string;
  proyecto: string;
}

interface Sugerencia {
  clave: string;
  grupo: "Órdenes de trabajo" | "PM";
  titulo: string;
  detalle: string;
  href: string;
}

const EJEMPLOS = ["134-26", "pérgola", "PRD-000123"];
const MAX_POR_GRUPO = 4;

function coincide(opcion: OpcionBusqueda, t: string): boolean {
  return [opcion.ot ?? "", opcion.pm, opcion.cliente, opcion.proyecto].some((v) =>
    v.toLowerCase().includes(t)
  );
}

// Buscador de la lista de Producción con pistas: sin escribir muestra ejemplos
// para tocar; al escribir sugiere O.T. y PM que coinciden (ir directo con un
// clic) y siempre deja la búsqueda completa, que además encuentra muebles y
// modelos en todos los pedidos.
export default function BuscadorOt({
  opciones,
  consulta,
  anio,
  cliente,
}: {
  opciones: OpcionBusqueda[];
  consulta: string;
  anio?: number | null;
  cliente?: string;
}) {
  const router = useRouter();
  const idLista = useId();
  const formulario = useRef<HTMLFormElement>(null);
  const [texto, setTexto] = useState(consulta);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);

  const sugerencias = useMemo<Sugerencia[]>(() => {
    const t = texto.trim().toLowerCase();
    if (t.length < 2) return [];
    const ots = new Map<string, Sugerencia>();
    const pms: Sugerencia[] = [];
    for (const o of opciones) {
      if (!coincide(o, t)) continue;
      if (o.ot && !ots.has(o.ot) && ots.size < MAX_POR_GRUPO) {
        ots.set(o.ot, {
          clave: `ot-${o.ot}`,
          grupo: "Órdenes de trabajo",
          titulo: `O.T. ${o.ot}`,
          detalle: `${o.proyecto} — ${o.cliente}`,
          href: `/produccion/ot/${encodeURIComponent(o.ot)}`,
        });
      }
      if (pms.length < MAX_POR_GRUPO && o.pm.toLowerCase().includes(t)) {
        pms.push({
          clave: `pm-${o.pedidoId}`,
          grupo: "PM",
          titulo: o.pm,
          detalle: `${o.proyecto} — ${o.cliente}`,
          href: `/produccion/pedidos/${o.pedidoId}`,
        });
      }
    }
    return [...ots.values(), ...pms];
  }, [texto, opciones]);

  const mostrarEjemplos = abierto && texto.trim().length === 0;
  const mostrarSugerencias = abierto && texto.trim().length >= 2;
  const hayPanel = mostrarEjemplos || mostrarSugerencias;

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setAbierto(false);
    } else if (e.key === "ArrowDown" && sugerencias.length) {
      e.preventDefault();
      setActiva((i) => (i + 1) % sugerencias.length);
    } else if (e.key === "ArrowUp" && sugerencias.length) {
      e.preventDefault();
      setActiva((i) => (i <= 0 ? sugerencias.length - 1 : i - 1));
    } else if (e.key === "Enter" && activa >= 0 && sugerencias[activa]) {
      // Con una sugerencia resaltada, Enter va directo; si no, busca.
      e.preventDefault();
      router.push(sugerencias[activa].href);
    }
  }

  return (
    <form
      ref={formulario}
      method="get"
      action="/produccion"
      className="flex flex-wrap items-center gap-2"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAbierto(false);
      }}
    >
      {anio && <input type="hidden" name="anio" value={anio} />}
      {cliente && <input type="hidden" name="cliente" value={cliente} />}
      <div className="relative min-w-0 flex-1">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          name="q"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setActiva(-1);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={alTeclear}
          placeholder="Buscar O.T., PM, cliente, mueble o modelo"
          autoComplete="off"
          role="combobox"
          aria-expanded={hayPanel}
          aria-controls={idLista}
          aria-autocomplete="list"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
        />

        {hayPanel && (
          <div
            id={idLista}
            className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            {mostrarEjemplos && (
              <div className="p-3">
                <p className="mb-2 text-xs font-medium text-slate-500">
                  Busca por O.T., PM, cliente, mueble, modelo o folio. Por ejemplo:
                </p>
                <div className="flex flex-wrap gap-2">
                  {EJEMPLOS.map((ej) => (
                    <button
                      key={ej}
                      type="button"
                      onClick={() => {
                        setTexto(ej);
                        setAbierto(true);
                        // El valor se aplica al renderizar: se envía después.
                        setTimeout(() => formulario.current?.requestSubmit(), 0);
                      }}
                      className="rounded-full border border-slate-300 px-3 py-1 font-mono text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {ej}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mostrarSugerencias && (
              <ul role="listbox">
                {(["Órdenes de trabajo", "PM"] as const).map((grupo) => {
                  const lista = sugerencias.filter((s) => s.grupo === grupo);
                  if (lista.length === 0) return null;
                  return (
                    <li key={grupo} role="presentation">
                      <p className="bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {grupo}
                      </p>
                      <ul role="presentation">
                        {lista.map((s) => {
                          const resaltada = sugerencias[activa]?.clave === s.clave;
                          return (
                            <li key={s.clave} role="option" aria-selected={resaltada}>
                              <Link
                                href={s.href}
                                className={`flex flex-col px-3 py-2 text-sm hover:bg-slate-50 ${
                                  resaltada ? "bg-brand-50" : ""
                                }`}
                              >
                                <span className="font-medium text-slate-900">{s.titulo}</span>
                                <span className="truncate text-xs text-slate-500">{s.detalle}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
                <li role="presentation" className="border-t border-slate-100">
                  <button
                    type="submit"
                    className="w-full px-3 py-2 text-left text-sm text-brand-700 hover:bg-slate-50"
                  >
                    Buscar &ldquo;{texto.trim()}&rdquo; también en muebles y modelos →
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
      </div>
      <button
        type="submit"
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400"
      >
        Buscar
      </button>
      {consulta && (
        <Link
          href={`/produccion${anio || cliente ? `?${new URLSearchParams({ ...(anio ? { anio: String(anio) } : {}), ...(cliente ? { cliente } : {}) })}` : ""}`}
          className="text-sm text-slate-500 underline hover:text-slate-700"
        >
          Limpiar
        </Link>
      )}
    </form>
  );
}
