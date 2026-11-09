"use client";

import { useEffect, useRef, useState } from "react";
import {
  MOTIVOS_ACTIVOS,
  NOTA_MAX,
  describirCambio,
  formatoFechaHora,
  type EventoMarca,
} from "@/lib/produccion/historial-marcas";

// Palomita y tache para que quien asigna (Producción) elija si el mueble está o no está en el taller
// del equipo, con una nota opcional (el motivo) y su historial. Un clic marca; el mismo clic otra vez
// la quita (vuelve a "sin marcar"). Al poner el tache se abre la ventana del motivo, que se puede
// omitir. Todo se guarda para el equipo; si no se pudo guardar, vuelve a como estaba y lo avisa.
export default function MarcaSeleccionable({
  asignacionId,
  itemId,
  inicial,
  notaInicial = null,
  puedeEditar,
  titulo,
  className = "",
  alGuardar,
}: {
  // De qué es la marca: una asignación o un mueble (ítem) que aún no tiene ninguna. Solo uno.
  asignacionId?: string;
  itemId?: string;
  inicial: boolean | null;
  notaInicial?: string | null;
  puedeEditar: boolean;
  // Para el título de la ventana: qué mueble (y de quién) es la marca.
  titulo: string;
  className?: string;
  // Se avisa, con la marca que quedó, cuando ya se guardó (para mostrar su registro en la tarjeta).
  alGuardar?: (marca: boolean | null) => void;
}) {
  const [marca, setMarca] = useState<boolean | null>(inicial);
  const [nota, setNota] = useState<string | null>(notaInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [abierta, setAbierta] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [eventos, setEventos] = useState<EventoMarca[] | null>(null);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);
  const areaNota = useRef<HTMLTextAreaElement>(null);

  const clave = asignacionId ? { asignacionId } : { itemId };

  // Manda la marca (y su nota) a guardar; devuelve si se pudo. Si falla, el que llama regresa su estado.
  async function enviar(esta: boolean | null, notaNueva: string | null): Promise<boolean> {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/produccion/marcas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...clave, esta, nota: notaNueva }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "No se pudo guardar la marca.");
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la marca.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function cargarHistorial() {
    setEventos(null);
    setErrorHistorial(null);
    try {
      const q = asignacionId ? `asignacionId=${asignacionId}` : `itemId=${itemId}`;
      const r = await fetch(`/api/produccion/marcas/historial?${q}`);
      const j = (await r.json().catch(() => null)) as { eventos?: EventoMarca[]; error?: string } | null;
      if (!r.ok || !j?.eventos) throw new Error(j?.error ?? "No se pudo leer el historial.");
      setEventos(j.eventos);
    } catch (e) {
      setErrorHistorial(e instanceof Error ? e.message : "No se pudo leer el historial.");
    }
  }

  function abrirVentana(texto: string) {
    setBorrador(texto);
    setAbierta(true);
    void cargarHistorial();
  }

  async function elegir(valor: boolean) {
    if (!puedeEditar || guardando) return;
    const anterior = { marca, nota };
    const nueva = marca === valor ? null : valor;
    setMarca(nueva);
    setNota(null);
    const ok = await enviar(nueva, null);
    if (!ok) {
      setMarca(anterior.marca);
      setNota(anterior.nota);
      return;
    }
    alGuardar?.(nueva);
    // Un tache pide el motivo (opcional): se abre la ventana para escribirlo (si los motivos están activos).
    if (nueva === false && MOTIVOS_ACTIVOS) abrirVentana("");
  }

  async function guardarNota() {
    if (marca === null || guardando) return;
    const texto = borrador.trim() === "" ? null : borrador.trim();
    const ok = await enviar(marca, texto);
    if (ok) {
      setNota(texto);
      setAbierta(false);
    }
  }

  useEffect(() => {
    if (abierta && puedeEditar) areaNota.current?.focus();
  }, [abierta, puedeEditar]);

  const base =
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed";
  const sinCambios = nota === (borrador.trim() === "" ? null : borrador.trim());
  return (
    <>
      <span
        role="group"
        aria-label="¿Está en el taller?"
        title={error ?? (puedeEditar ? undefined : "Solo Producción puede marcarlo")}
        className={`inline-flex items-center gap-1 rounded-full p-0.5 ${error ? "ring-2 ring-rose-400" : ""} ${className}`}
      >
        <button
          type="button"
          aria-pressed={marca === true}
          disabled={!puedeEditar || guardando}
          onClick={() => elegir(true)}
          title="Sí está en el taller"
          className={`${base} ${
            marca === true
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-slate-300 bg-white text-slate-400 hover:border-emerald-500 hover:text-emerald-600 disabled:hover:border-slate-300 disabled:hover:text-slate-400"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="m5 12 5 5 9-10" />
          </svg>
          <span className="sr-only">Sí está</span>
        </button>
        <button
          type="button"
          aria-pressed={marca === false}
          disabled={!puedeEditar || guardando}
          onClick={() => elegir(false)}
          title="No está en el taller"
          className={`${base} ${
            marca === false
              ? "border-rose-600 bg-rose-600 text-white"
              : "border-slate-300 bg-white text-slate-400 hover:border-rose-500 hover:text-rose-600 disabled:hover:border-slate-300 disabled:hover:text-slate-400"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
          <span className="sr-only">No está</span>
        </button>
        {MOTIVOS_ACTIVOS && (
          <button
            type="button"
            onClick={() => abrirVentana(nota ?? "")}
            title={nota ? `Motivo: ${nota}` : puedeEditar ? "Agregar motivo e historial" : "Ver historial"}
            aria-label={nota ? "Ver o cambiar el motivo y el historial" : "Agregar motivo o ver el historial"}
            className={`${base} ${
              nota
                ? "border-amber-500 bg-amber-100 text-amber-800"
                : "border-slate-300 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-600"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
            </svg>
          </button>
        )}
        {error && (
          <span role="alert" className="sr-only">
            {error}
          </span>
        )}
      </span>

      {abierta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Motivo e historial de la marca"
          onKeyDown={(e) => {
            if (e.key === "Escape") setAbierta(false);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setAbierta(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                {marca === true && "Marcado: sí está en el taller."}
                {marca === false && "Marcado: no está en el taller."}
                {marca === null && "Sin marca: elige la palomita o el tache para poder anotar un motivo."}
              </p>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Motivo o nota (opcional)
              </span>
              <textarea
                ref={areaNota}
                rows={3}
                maxLength={NOTA_MAX}
                value={borrador}
                readOnly={!puedeEditar || marca === null}
                onChange={(e) => setBorrador(e.target.value)}
                placeholder={marca === false ? "¿Por qué no está? (no ha llegado, falta barniz, dañado…)" : "Una nota corta"}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none read-only:bg-slate-50"
              />
              <span className="self-end text-xs tabular-nums text-slate-400">
                {borrador.length}/{NOTA_MAX}
              </span>
            </label>
            {error && <p className="text-sm text-rose-700">{error}</p>}

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historial</h3>
              {errorHistorial ? (
                <p className="mt-1 text-sm text-slate-500">{errorHistorial}</p>
              ) : eventos === null ? (
                <p className="mt-1 text-sm text-slate-500">Cargando…</p>
              ) : eventos.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">Todavía no hay cambios.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-2">
                  {eventos.map((e) => (
                    <li key={e.id} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm">
                      <p className="font-medium text-slate-800">{describirCambio(e)}</p>
                      <p className="text-xs text-slate-500">
                        {formatoFechaHora(e.hecho_en)} · {e.hecho_por_nombre ?? "—"}
                      </p>
                      {e.nota && <p className="mt-0.5 text-xs text-slate-700">“{e.nota}”</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbierta(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-brand-50"
              >
                {puedeEditar && marca !== null ? "Omitir" : "Cerrar"}
              </button>
              {puedeEditar && marca !== null && (
                <button
                  type="button"
                  disabled={guardando || sinCambios}
                  onClick={guardarNota}
                  className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-400 disabled:opacity-50"
                >
                  Guardar motivo
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
