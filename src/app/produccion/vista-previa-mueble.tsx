"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import ImagenAmpliable from "@/components/imagen-ampliable";
import type { ProcesoAvance } from "@/lib/produccion/inicio";
import { diaCorto, type AvanceTarjeta, type TarjetaTablero } from "@/lib/produccion/tablero";
import { usePresencia } from "@/lib/ui/use-presencia";
import { AnillosConcentricos, COLOR_ESTADO } from "./anillo-estados";
import MarcaSeleccionable from "./marca-seleccionable";

// Color de la etiqueta de una marca: verde si está, rojo si no, gris si se quitó.
export function claseMarca(marca: boolean | null): string {
  return marca === true
    ? "bg-emerald-100 text-emerald-800"
    : marca === false
      ? "bg-rose-100 text-rose-800"
      : "bg-slate-200 text-slate-700";
}

// Vista previa de un mueble en taller: una ventana flotante sobre la página (como la vista previa de una
// historia al dejarla presionada), con su imagen, cómo va, la bitácora (palomita o tache) y, debajo, las opciones a las
// que antes había que salir para llegar. Se cierra con Esc, tocando fuera o con "Cerrar".
export default function VistaPreviaMueble({
  t,
  avance: a,
  asignacionId,
  abierta,
  alCerrar,
  marca,
  puedeEditar,
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
              <p className="text-xs text-slate-500">
                Última entrega: <span className="font-medium tabular-nums text-slate-700">{diaCorto(a.ultimaEntrega) || "sin entregas"}</span>
              </p>
            </div>

            {a.procesos.length > 0 && (
              <ol className="flex items-start" aria-label="Ruta del mueble">
                {a.procesos.map((p, i) => (
                  <PasoDeRuta key={p.etiqueta} p={p} hayMas={i < a.procesos.length - 1} />
                ))}
              </ol>
            )}

            <div className="flex flex-col gap-2 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Bitácora</h3>
                <MarcaSeleccionable
                  asignacionId={asignacionId}
                  inicial={marca}
                  notaInicial={t.nota}
                  puedeEditar={puedeEditar}
                  titulo={`${t.modelo}${t.subtitulo ? ` · ${t.subtitulo}` : ""}`}
                  alGuardar={alGuardar}
                />
              </div>
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
