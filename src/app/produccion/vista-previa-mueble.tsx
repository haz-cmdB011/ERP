"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ImagenAmpliable from "@/components/imagen-ampliable";
import { fetchJson } from "@/lib/http/fetch-json";
import { formatoFechaHora, textoMarca, type EventoMarca } from "@/lib/produccion/historial-marcas";
import type { ProcesoAvance } from "@/lib/produccion/inicio";
import { diaCorto, type AvanceTarjeta, type TarjetaTablero } from "@/lib/produccion/tablero";
import { usePresencia } from "@/lib/ui/use-presencia";
import { AnillosConcentricos, COLOR_ESTADO } from "./anillo-estados";
import MarcaSeleccionable from "./marca-seleccionable";

const ULTIMOS_PASES = 4;

// Color de la etiqueta de una marca: verde si está, rojo si no, gris si se quitó.
export function claseMarca(marca: boolean | null): string {
  return marca === true
    ? "bg-emerald-100 text-emerald-800"
    : marca === false
      ? "bg-rose-100 text-rose-800"
      : "bg-slate-200 text-slate-700";
}

// Vista previa de un mueble en taller: una ventana flotante sobre la página (como la vista previa de una
// historia al dejarla presionada), con su imagen, cómo va, el pase de lista y, debajo, las opciones a las
// que antes había que salir para llegar. Se cierra con Esc, tocando fuera o con "Cerrar".
export default function VistaPreviaMueble({
  t,
  avance: a,
  asignacionId,
  abierta,
  alCerrar,
  marca,
  puedeEditar,
  version,
  alGuardar,
}: {
  t: TarjetaTablero;
  avance: AvanceTarjeta;
  asignacionId: string;
  abierta: boolean;
  alCerrar: () => void;
  // La marca vigente (la de la tarjeta, o la que se acaba de marcar) y qué hacer cuando se guarda otra.
  marca: boolean | null;
  puedeEditar: boolean;
  // Cambia con cada marca guardada, para volver a leer el pase de lista.
  version: number;
  alGuardar: (marca: boolean | null) => void;
}) {
  const { montado, saliendo } = usePresencia(abierta);
  const botonCerrar = useRef<HTMLButtonElement>(null);
  const cerrarAhora = useRef(alCerrar);
  useEffect(() => {
    cerrarAhora.current = alCerrar;
  });

  // Al abrir: el foco pasa a la ventana, la página de atrás no se desplaza y Esc la cierra. Al cerrar, el
  // foco vuelve a donde estaba.
  useEffect(() => {
    if (!abierta) return;
    const previo = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    botonCerrar.current?.focus({ preventScroll: true });
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarAhora.current();
    };
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflow;
      previo?.focus();
    };
  }, [abierta]);

  if (!montado) return null;

  const unidad = a.unidad ? ` ${a.unidad}` : "";
  const color = a.pct >= 100 ? COLOR_ESTADO.terminado : COLOR_ESTADO.en_proceso;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vista previa de ${t.modelo}`}
      data-saliendo={saliendo || undefined}
      onClick={alCerrar}
      className="fixed inset-0 z-50 flex overflow-y-auto bg-scrim/55 p-4 backdrop-blur-sm"
    >
      <div onClick={(e) => e.stopPropagation()} className="m-auto flex w-full max-w-sm flex-col gap-3">
        <section className="overflow-hidden rounded-2xl bg-white shadow-2xl">
          {/* La imagen completa, sin recortar, dentro de un marco con margen; al tocarla se amplía. */}
          {t.imagen && (
            <div className="px-4 pt-4">
              <ImagenAmpliable
                url={t.imagen.url}
                urlGrande={t.imagen.urlGrande}
                alt={`Imagen de ${t.modelo}`}
                ajuste="contain"
                className="h-52 w-full rounded-xl! border-slate-200 bg-slate-50 p-2"
              />
            </div>
          )}

          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight text-slate-900">{t.modelo}</h2>
                {t.subtitulo && <p className="mt-0.5 text-sm text-slate-500">{t.subtitulo}</p>}
                <p className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium text-slate-700">
                  <span className="rounded-md border border-slate-200 px-1.5 py-0.5" title={t.numeroPm}>
                    {t.pmCorto}
                  </span>
                  <span className="rounded-md border border-slate-200 px-1.5 py-0.5">{t.ot ? `O.T. ${t.ot}` : "Sin O.T."}</span>
                </p>
              </div>
              {t.conteos && <AnillosConcentricos conteos={t.conteos} tamano="size-16" />}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="tabular-nums text-slate-500">
                  <b className="text-2xl font-semibold text-slate-900">{a.entregado}</b>
                  <span className="text-sm"> de {a.total}{unidad} entregadas</span>
                </p>
                <span className="text-sm font-semibold tabular-nums text-slate-700">{a.pct}%</span>
              </div>
              <span className="h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${a.pct}%`, background: color }} />
              </span>
            </div>

            {a.procesos.length > 0 && (
              <ol className="flex items-start" aria-label="Ruta del mueble">
                {a.procesos.map((p, i) => (
                  <PasoDeRuta key={p.etiqueta} p={p} hayMas={i < a.procesos.length - 1} />
                ))}
              </ol>
            )}

            <dl className="grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 text-center">
              <Dato etiqueta="Sin entregar" valor={`${a.sinEntregar}${unidad}`} />
              <Dato etiqueta="En taller" valor={a.diasEnTaller > 0 ? `${a.diasEnTaller} d` : "Hoy"} />
              <Dato etiqueta="Última entrega" valor={diaCorto(a.ultimaEntrega) || "—"} />
            </dl>

            <div className="flex flex-col gap-2 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Pase de lista</h3>
                <MarcaSeleccionable
                  asignacionId={asignacionId}
                  inicial={marca}
                  notaInicial={t.nota}
                  puedeEditar={puedeEditar}
                  titulo={`${t.modelo}${t.subtitulo ? ` · ${t.subtitulo}` : ""}`}
                  alGuardar={alGuardar}
                />
              </div>
              <PaseDeLista key={version} asignacionId={asignacionId} />
            </div>
          </div>
        </section>

        <nav aria-label="Opciones" className="overflow-hidden rounded-2xl bg-white shadow-2xl">
          <ul className="divide-y divide-slate-100">
            <Opcion href={t.hrefModelo} icono="M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z">
              Ver en el panel de asignación
            </Opcion>
            <Opcion href={t.hrefPm} icono="M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6">
              Abrir el pedido {t.pmCorto}
            </Opcion>
            <Opcion
              href={`/produccion/bitacora?vista=historial&q=${encodeURIComponent(t.modelo)}`}
              icono="M9 4h6v3H9zM6 6h3M15 6h3M6 6v14h12V6M9 12l2 2 4-4M9 17h6"
            >
              Ver todo el pase de lista
            </Opcion>
            <li>
              <button
                ref={botonCerrar}
                type="button"
                onClick={alCerrar}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
              >
                <Icono d="M6 6l12 12M18 6 6 18" />
                Cerrar
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}

function Icono({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0 text-slate-600" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Opcion({ href, icono, children }: { href: string; icono: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
      >
        <Icono d={icono} />
        {children}
      </Link>
    </li>
  );
}

// Los últimos cambios de la marca de la asignación (quién y cuándo), leídos del historial que guarda la
// base. Se vuelve a montar con cada marca (`key`), así que siempre lee el registro recién guardado.
function PaseDeLista({ asignacionId }: { asignacionId: string }) {
  const [eventos, setEventos] = useState<EventoMarca[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    fetchJson<{ eventos?: EventoMarca[]; error?: string }>(`/api/produccion/marcas/historial?asignacionId=${asignacionId}`).then((r) => {
      if (!vigente) return;
      if (r.ok && r.data.eventos) setEventos(r.data.eventos);
      else setError(r.error ?? "No se pudo leer el pase de lista.");
    });
    return () => {
      vigente = false;
    };
  }, [asignacionId]);

  if (error) return <p className="text-xs text-rose-700">{error}</p>;
  if (eventos === null) return <p className="text-xs text-slate-500">Cargando…</p>;
  if (eventos.length === 0) return <p className="text-xs text-slate-500">Todavía no se pasa lista. Marca la palomita o el tache.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {eventos.slice(0, ULTIMOS_PASES).map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${claseMarca(e.esta)}`}>{textoMarca(e.esta)}</span>
          <span className="tabular-nums">{formatoFechaHora(e.hecho_en)}</span>
          <span className="truncate">{e.hecho_por_nombre ?? "—"}</span>
        </li>
      ))}
    </ul>
  );
}

// Un proceso de la ruta, como un punto unido al siguiente por una línea: completo (palomita), en curso
// (anillo con su %) o pendiente (vacío). La línea se pinta hasta donde ya se completó.
function PasoDeRuta({ p, hayMas }: { p: ProcesoAvance; hayMas: boolean }) {
  const texto = p.estado === "terminado" ? "Terminado" : p.estado === "en_proceso" ? `En proceso, ${p.pct}%` : "Sin empezar";
  return (
    <li className="relative flex min-w-0 flex-1 flex-col items-center gap-1" aria-label={`${p.etiqueta}: ${texto}`}>
      {hayMas && (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-[15px] h-0.5 w-full"
          style={{ background: p.estado === "terminado" ? COLOR_ESTADO.terminado : "var(--color-slate-200)" }}
        />
      )}
      {p.estado === "terminado" ? (
        <span className="relative grid size-8 place-items-center rounded-full text-white" style={{ background: COLOR_ESTADO.terminado }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="m5 12 5 5 9-10" />
          </svg>
        </span>
      ) : p.estado === "en_proceso" ? (
        <span
          className="relative grid size-8 place-items-center rounded-full"
          style={{ background: `conic-gradient(${COLOR_ESTADO.en_proceso} ${p.pct}%, var(--color-slate-200) 0)` }}
        >
          <span className="grid size-6 place-items-center rounded-full bg-white text-[10px] font-bold tabular-nums text-slate-700">{p.pct}</span>
        </span>
      ) : (
        <span
          className="relative grid size-8 place-items-center rounded-full border-2 border-dashed bg-white text-[10px] font-semibold tabular-nums text-slate-400"
          style={{ borderColor: COLOR_ESTADO.por_asignar }}
        >
          {p.pct}
        </span>
      )}
      <span className="w-full truncate text-center text-xs text-slate-700" title={p.etiqueta}>
        {p.etiqueta}
      </span>
    </li>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse px-2 py-2">
      <dt className="truncate text-[11px] text-slate-500">{etiqueta}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums text-slate-900">{valor}</dd>
    </div>
  );
}
