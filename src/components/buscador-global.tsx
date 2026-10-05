"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  MIN_CARACTERES_BUSQUEDA,
  type AreaBusqueda,
  type GrupoBusqueda,
  type ResultadoBusqueda,
  type TipoResultado,
} from "@/lib/busqueda/global";

const ESPERA_MS = 180;
const SIN_GRUPOS: GrupoBusqueda[] = [];

const ETIQUETA_TIPO: Record<TipoResultado, string> = {
  pantalla: "Ir a",
  ot: "O.T.",
  pm: "PM",
  modelo: "Modelo",
  "folio-calidad": "Calidad",
  "folio-produccion": "Producción",
  recibo: "Recibo",
};

type Estado =
  | { fase: "inicio" }
  | { fase: "buscando" }
  | { fase: "listo"; grupos: GrupoBusqueda[] }
  | { fase: "error"; mensaje: string };

function IconoLupa({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function suscribirNada() {
  return () => {};
}

// ¿El foco está en un campo de texto? Ahí "/" se escribe, no abre el buscador.
function escribiendoEnCampo(destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false;
  return (
    destino.isContentEditable ||
    destino.tagName === "INPUT" ||
    destino.tagName === "TEXTAREA" ||
    destino.tagName === "SELECT"
  );
}

// Buscador global: botón en la barra de cada área y atajo Ctrl + K (⌘ K en
// Mac) o "/" desde cualquier pantalla. Busca en /api/buscar mientras se
// escribe; con las flechas se elige y con Enter se abre.
export default function BuscadorGlobal({ area }: { area: AreaBusqueda }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [estado, setEstado] = useState<Estado>({ fase: "inicio" });
  const [activo, setActivo] = useState(0);
  // En el servidor no hay navigator: se asume Windows y se corrige al hidratar.
  const esMac = useSyncExternalStore(
    suscribirNada,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false
  );
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const focoPrevio = useRef<HTMLElement | null>(null);
  const idLista = useId();

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto((a) => !a);
      } else if (e.key === "/" && !abierto && !escribiendoEnCampo(e.target)) {
        e.preventDefault();
        setAbierto(true);
      }
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  // Al abrir: guarda el foco para devolverlo al cerrar y enfoca el campo.
  useEffect(() => {
    if (abierto) {
      focoPrevio.current = document.activeElement as HTMLElement | null;
      campo.current?.focus();
      campo.current?.select();
    } else {
      focoPrevio.current?.focus?.();
    }
  }, [abierto]);

  // Busca con una pausa corta tras la última tecla y cancela la búsqueda
  // anterior si todavía no respondía.
  useEffect(() => {
    if (!abierto) return;
    const texto = consulta.trim();
    if (!texto) return;
    const control = new AbortController();
    const espera = setTimeout(async () => {
      setEstado({ fase: "buscando" });
      try {
        const res = await fetch(
          `/api/buscar?q=${encodeURIComponent(texto)}&area=${area}`,
          { signal: control.signal },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setEstado({
            fase: "error",
            mensaje: data.error ?? "No se pudo buscar.",
          });
          return;
        }
        setEstado({ fase: "listo", grupos: data.grupos ?? [] });
        setActivo(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setEstado({
            fase: "error",
            mensaje: "No se pudo buscar. Revisa tu conexión.",
          });
        }
      }
    }, ESPERA_MS);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [consulta, abierto, area]);

  // Sin texto se muestra la ayuda inicial, aunque quede una búsqueda anterior.
  const vista: Estado = consulta.trim() ? estado : { fase: "inicio" };
  const grupos = vista.fase === "listo" ? vista.grupos : SIN_GRUPOS;
  const resultados = useMemo(
    () => grupos.flatMap((g) => g.resultados),
    [grupos],
  );
  // Posición de cada grupo en la lista completa (para las flechas).
  const inicioGrupo = useMemo(() => {
    const inicios: number[] = [];
    let total = 0;
    for (const g of grupos) {
      inicios.push(total);
      total += g.resultados.length;
    }
    return inicios;
  }, [grupos]);

  // Mantiene visible la opción elegida con el teclado.
  useEffect(() => {
    lista.current
      ?.querySelector(`[data-indice="${activo}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  function cerrar() {
    setAbierto(false);
  }

  function abrirResultado(resultado: ResultadoBusqueda) {
    cerrar();
    router.push(resultado.href);
  }

  function alTeclearEnCampo(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && resultados.length) {
      e.preventDefault();
      setActivo((i) => (i + 1) % resultados.length);
    } else if (e.key === "ArrowUp" && resultados.length) {
      e.preventDefault();
      setActivo((i) => (i - 1 + resultados.length) % resultados.length);
    } else if (e.key === "Enter" && resultados[activo]) {
      e.preventDefault();
      abrirResultado(resultados[activo]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cerrar();
    }
  }

  const atajo = esMac ? "⌘ K" : "Ctrl K";

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="group inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg sm:h-10 sm:w-10 xl:w-auto text-on-nav-suave transition-colors hover:bg-nav-hover hover:text-on-nav focus-visible:outline-brand-500 xl:border xl:border-nav-line xl:px-3"
        aria-label={`Buscar (${atajo})`}
        aria-keyshortcuts="Control+K Meta+K"
      >
        <IconoLupa className="h-[18px] w-[18px] transition-transform duration-200 group-hover:-rotate-12 group-hover:scale-125" />
        <span className="hidden xl:inline">Buscar…</span>
        <kbd className="hidden rounded border border-nav-line bg-nav-hover px-1.5 font-sans text-[11px] text-on-nav-suave xl:inline">
          {atajo}
        </kbd>
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-scrim/40 px-4 pt-[10vh] print:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cerrar();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Buscador"
            className="flex max-h-[75vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 px-4">
              <IconoLupa className="h-5 w-5 shrink-0 text-slate-400" />
              <input
                ref={campo}
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                onKeyDown={alTeclearEnCampo}
                placeholder="O.T., PM, modelo, folio, proyecto o pantalla…"
                className="w-full bg-transparent py-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
                role="combobox"
                aria-expanded={resultados.length > 0}
                aria-controls={idLista}
                aria-activedescendant={
                  resultados.length ? `${idLista}-${activo}` : undefined
                }
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck={false}
              />
              {vista.fase === "buscando" && (
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
                  aria-label="Buscando"
                />
              )}
              <button
                type="button"
                onClick={cerrar}
                className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-800"
              >
                Esc
              </button>
            </div>

            <div
              ref={lista}
              id={idLista}
              role="listbox"
              className="overflow-y-auto py-2"
            >
              {vista.fase === "inicio" && (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  Escribe una O.T. (009-26), un PM, un modelo, un folio o el
                  nombre de una pantalla.
                </p>
              )}
              {vista.fase === "error" && (
                <p className="px-4 py-6 text-center text-sm text-rose-700">
                  {vista.mensaje}
                </p>
              )}
              {vista.fase === "listo" && resultados.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  {consulta.trim().length < MIN_CARACTERES_BUSQUEDA
                    ? "Escribe al menos 2 caracteres."
                    : `Sin resultados para «${consulta.trim()}».`}
                </p>
              )}
              {grupos.map((grupo, g) => (
                <div
                  key={grupo.titulo}
                  role="group"
                  aria-label={grupo.titulo}
                  className="pb-1"
                >
                  <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {grupo.titulo}
                  </p>
                  {grupo.resultados.map((r, j) => {
                    const i = inicioGrupo[g] + j;
                    const elegido = i === activo;
                    return (
                      <div
                        key={`${r.tipo}-${r.href}`}
                        id={`${idLista}-${i}`}
                        data-indice={i}
                        role="option"
                        aria-selected={elegido}
                        onMouseMove={() => setActivo(i)}
                        onClick={() => abrirResultado(r)}
                        className={`mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ${
                          elegido ? "bg-brand-50" : ""
                        }`}
                      >
                        <span className="w-14 shrink-0 text-[11px] sm:w-20 font-medium uppercase tracking-wide text-slate-400">
                          {ETIQUETA_TIPO[r.tipo]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm font-medium ${
                              elegido ? "text-brand-800" : "text-slate-900"
                            }`}
                          >
                            {r.titulo}
                          </span>
                          {r.detalle && (
                            <span className="block truncate text-xs text-slate-500">
                              {r.detalle}
                            </span>
                          )}
                        </span>
                        {elegido && (
                          <span
                            className="hidden shrink-0 text-xs text-slate-400 sm:inline"
                            aria-hidden="true"
                          >
                            ↵
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="hidden items-center gap-4 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500 sm:flex">
              <span>↑ ↓ para elegir</span>
              <span>↵ para abrir</span>
              <span>Esc para cerrar</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
