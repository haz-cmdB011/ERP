"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ImagenAmpliable from "@/components/imagen-ampliable";
import {
  COLUMNAS_TABLERO,
  MAX_TARJETAS_RECIENTES,
  TARJETAS_POR_COLUMNA,
  clavesMasRecientes,
  conteosColumnas,
  enColumna,
  seccionesPorOt,
  type AvanceTarjeta,
  type Columna,
  type SeccionTablero,
  type TarjetaTablero,
} from "@/lib/produccion/tablero";
import { COLOR_ESTADO, AnillosConcentricos } from "./anillo-estados";
import EntregarMueble from "./entregar-mueble";
import VistaPreviaMueble from "./vista-previa-mueble";

// Cada columna se distingue solo por un punto de color junto a su título: el resto es neutro, para que
// el tablero no compita con los anillos de cada mueble (que son lo que lleva el color).
const PUNTO_COLUMNA: Record<Columna, string> = {
  por_entregar: "bg-emerald-500",
  por_asignar: "bg-rose-400",
  en_calidad: "bg-violet-500",
};

// Tablero separado por O.T.: cada O.T. es una sección que se pliega, con sus columnas ("Por entregar",
// "Por asignar" y, solo si hay algo, "En Calidad"), una debajo de la otra. Cada columna es una tira de tarjetas que se desliza de lado
// (con el dedo, o con las flechas en pantalla ancha), así que la altura de una O.T. no crece con la
// cantidad de muebles. "Ver todos" abre una hoja con todos en cuadrícula. Cada mueble (o asignación) es
// una tarjeta con su foto (que se amplía al tocarla) y los anillos de su modelo encima, su nombre, de qué
// PM es (solo "PM009-26" o "SDC-1") y su botón: en "Por asignar", Asignar abre el panel de asignación con
// ese mueble; en "Por entregar", Entregar abre la ventana para registrar la entrega (con un enlace al panel si el
// mueble se entrega por partes, desde la misma ventana) y la barra de avance abre la vista previa. Por omisión muestra lo más
// reciente que se trabajó; "Todos" lo muestra completo.
export default function TableroMarcas({
  tarjetas,
  puedeEditar,
  acciones,
}: {
  tarjetas: TarjetaTablero[];
  puedeEditar: boolean;
  // Lo que va a la derecha del encabezado (el interruptor Tablero / Lista).
  acciones?: React.ReactNode;
}) {
  // Secciones plegadas por el usuario (por defecto todas abiertas si hay pocas; con muchas, solo la primera).
  const [plegadas, setPlegadas] = useState<Record<string, boolean>>({});
  // La columna cuya hoja "Ver todos" está abierta (clave de O.T. + columna).
  const [hoja, setHoja] = useState<string | null>(null);

  // "Más recientes" muestra solo las tarjetas con movimiento más reciente; "Todos", el tablero completo.
  const [soloRecientes, setSoloRecientes] = useState(true);
  const recientes = useMemo(() => clavesMasRecientes(tarjetas, MAX_TARJETAS_RECIENTES), [tarjetas]);
  const hayMas = tarjetas.length > MAX_TARJETAS_RECIENTES;
  const aLaVista = useMemo(
    () => (soloRecientes && hayMas ? tarjetas.filter((t) => recientes.has(t.clave)) : tarjetas),
    [soloRecientes, hayMas, tarjetas, recientes]
  );
  const secciones = useMemo(() => seccionesPorOt(aLaVista), [aLaVista]);
  // Con muchas O.T., solo la primera empieza abierta; con pocas, todas.
  const estaPlegada = (s: SeccionTablero, i: number) => plegadas[s.clave] ?? (secciones.length > 3 && i > 0);

  return (
    <section aria-label="Bitácora de producción" className="flex min-w-0 flex-col">
      {(hayMas || acciones) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          {hayMas ? (
            <div role="group" aria-label="Qué muebles ver" className="flex gap-4 text-sm">
              {[
                { activo: true, etiqueta: "Más recientes", cuantos: MAX_TARJETAS_RECIENTES },
                { activo: false, etiqueta: "Todos", cuantos: tarjetas.length },
              ].map((o) => (
                <button
                  key={o.etiqueta}
                  type="button"
                  onClick={() => setSoloRecientes(o.activo)}
                  aria-pressed={soloRecientes === o.activo}
                  className={`border-b pb-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                    soloRecientes === o.activo
                      ? "border-slate-900 font-medium text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {o.etiqueta}
                  <span className="ml-1.5 text-xs tabular-nums text-slate-400">{o.cuantos}</span>
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          {acciones}
        </div>
      )}

      {secciones.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-slate-500">No hay muebles por entregar ni por asignar.</p>
      )}

      <div className="flex flex-col divide-y divide-slate-100">
        {secciones.map((sec, i) => {
          const cuentas = conteosColumnas(sec.tarjetas);
          const plegada = estaPlegada(sec, i);
          return (
            <section key={sec.clave} aria-label={sec.titulo} className="min-w-0 px-5">
              <div className="flex flex-wrap items-center justify-between gap-2 py-4">
                <div className="flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPlegadas((p) => ({ ...p, [sec.clave]: !plegada }))}
                    aria-expanded={!plegada}
                    aria-label={`${plegada ? "Abrir" : "Plegar"} ${sec.titulo}`}
                    className="-ml-1.5 grid size-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:text-slate-900"
                  >
                    <Chevron className={`size-4 transition-transform motion-reduce:transition-none ${plegada ? "-rotate-90" : ""}`} />
                  </button>
                  {sec.hrefOt ? (
                    <Link href={sec.hrefOt} className="truncate text-base font-medium text-slate-900 hover:underline">
                      {sec.titulo}
                    </Link>
                  ) : (
                    <h3 className="truncate text-base font-medium text-slate-900">{sec.titulo}</h3>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-4 text-sm tabular-nums text-slate-500" aria-label="Cuántas hay en cada columna">
                  {sec.atrasadas > 0 && (
                    <span className="font-medium text-rose-700" title="Con la fecha de entrega del PM vencida">
                      {sec.atrasadas} atrasada{sec.atrasadas === 1 ? "" : "s"}
                    </span>
                  )}
                  {COLUMNAS_TABLERO.filter((c) => c.valor !== "en_calidad" || cuentas.en_calidad > 0).map((c) => (
                    <span key={c.valor} className="inline-flex items-center gap-1.5" title={c.titulo}>
                      <span aria-hidden="true" className={`size-1.5 rounded-full ${PUNTO_COLUMNA[c.valor]}`} />
                      {cuentas[c.valor]}
                    </span>
                  ))}
                </div>
              </div>

              {!plegada && (
                <div className="flex flex-col gap-6 pb-6">
                  {COLUMNAS_TABLERO.map((c) => {
                    const lista = enColumna(sec.tarjetas, c.valor);
                    // "En Calidad" solo sale cuando hay algo: no hace falta una tira vacía en cada O.T.
                    if (c.valor === "en_calidad" && lista.length === 0) return null;
                    const llave = `${sec.clave}|${c.valor}`;
                    return (
                      <Tira
                        key={c.valor}
                        columna={c.valor}
                        titulo={c.titulo}
                        lista={lista}
                        puedeEditar={puedeEditar}
                        alVerTodos={() => setHoja(llave)}
                      >
                        {hoja === llave && (
                          <HojaTodos
                            columna={c.valor}
                            titulo={`${c.titulo} · ${sec.titulo}`}
                            lista={lista}
                            puedeEditar={puedeEditar}
                            alCerrar={() => setHoja(null)}
                          />
                        )}
                      </Tira>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function Chevron({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Una columna de una O.T.: su título con cuántas hay y, debajo, la tira de tarjetas que se desliza de
// lado. La tira llega hasta el borde de la pantalla y asoma la tarjeta siguiente, para que se note que
// hay más. Con más de unas pocas tarjetas: "Ver todos" (abre la hoja) y, en pantalla ancha, flechas.
function Tira({
  columna,
  titulo,
  lista,
  puedeEditar,
  alVerTodos,
  children,
}: {
  columna: Columna;
  titulo: string;
  lista: TarjetaTablero[];
  puedeEditar: boolean;
  alVerTodos: () => void;
  children?: React.ReactNode;
}) {
  const pista = useRef<HTMLUListElement | null>(null);

  function mover(sentido: 1 | -1) {
    const el = pista.current;
    if (!el) return;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: sentido * el.clientWidth * 0.8, behavior: suave ? "smooth" : "auto" });
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-2 pb-3 text-sm text-slate-500">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${PUNTO_COLUMNA[columna]}`} />
        <h4 className="font-medium text-slate-700">{titulo}</h4>
        <span className="tabular-nums">{lista.length}</span>
        {lista.length > 2 && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={alVerTodos}
              aria-haspopup="dialog"
              className="rounded px-1.5 py-0.5 text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              Ver todos
            </button>
            {lista.length > 4 && (
              <>
                <button
                  type="button"
                  onClick={() => mover(-1)}
                  aria-label={`Anteriores de ${titulo}`}
                  className="hidden size-7 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-600 sm:grid"
                >
                  <Chevron className="size-4 rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => mover(1)}
                  aria-label={`Siguientes de ${titulo}`}
                  className="hidden size-7 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-600 sm:grid"
                >
                  <Chevron className="size-4 -rotate-90" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-slate-500">Nada por aquí</p>
      ) : (
        <ul
          ref={pista}
          className="-mx-5 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain scroll-px-5 px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {lista.slice(0, TARJETAS_POR_COLUMNA).map((t) => (
            <TarjetaVista
              key={t.clave}
              t={t}
              puedeEditar={puedeEditar}
              ancho="w-36 shrink-0 snap-start sm:w-44"
            />
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}

// Todos los muebles de una columna, en cuadrícula, sobre la página: sube desde abajo en celular y se
// centra en pantalla ancha. Esc, la × o tocar fuera la cierran.
function HojaTodos({
  columna,
  titulo,
  lista,
  puedeEditar,
  alCerrar,
}: {
  columna: Columna;
  titulo: string;
  lista: TarjetaTablero[];
  puedeEditar: boolean;
  alCerrar: () => void;
}) {
  const cerrarAhora = useRef(alCerrar);
  useEffect(() => {
    cerrarAhora.current = alCerrar;
  });
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarAhora.current();
    };
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Todos: ${titulo}`} className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={alCerrar}
        className="absolute inset-0 cursor-default bg-scrim/55 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[88vh] w-full max-w-4xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-sm text-slate-500">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${PUNTO_COLUMNA[columna]}`} />
          <h2 className="min-w-0 truncate text-base font-medium text-slate-900">{titulo}</h2>
          <span className="tabular-nums">{lista.length}</span>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="ml-auto grid size-8 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-6 overflow-y-auto p-5 sm:grid-cols-3 lg:grid-cols-4">
          {lista.map((t) => (
            <TarjetaVista key={t.clave} t={t} puedeEditar={puedeEditar} ancho="min-w-0" />
          ))}
        </ul>
      </div>
    </div>
  );
}

// Los botones de la tarjeta tienen cuerpo propio para que se note que se presionan: Entregar, que cierra
// el trabajo, va relleno de tinta; Asignar, que hay varios por columna, va con un relleno suave. Ocupan
// todo el ancho de la tarjeta, al pie.
const BOTON_BASE =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors sm:min-h-9 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
const ESTILO_ENTREGAR = `${BOTON_BASE} bg-slate-900 text-white hover:bg-slate-700`;
const ESTILO_ASIGNAR = `${BOTON_BASE} bg-slate-100 text-slate-900 ring-1 ring-inset ring-slate-200 hover:bg-slate-200`;

function TarjetaVista({ t, puedeEditar, ancho }: { t: TarjetaTablero; puedeEditar: boolean; ancho: string }) {
  // La vista previa flotante (con la bitácora de la asignación) y la ventana de entrega. `marca` es la
  // vigente (la que viene o la que se marcó en la vista previa).
  const [abierta, setAbierta] = useState(false);
  const [entregando, setEntregando] = useState(false);
  const [marca, setMarca] = useState(t.marca);
  const cerrar = () => setAbierta(false);
  // Producción la marcó con tache en la bitácora: se avisa en la tarjeta sin abrir la vista previa.
  const noEsta = !!t.asignacionId && marca === false;

  const accion =
    t.avance && t.asignacionId
      ? puedeEditar && (
          <button
            type="button"
            onClick={() => setEntregando(true)}
            aria-haspopup="dialog"
            title={`Registrar la entrega de ${t.modelo}`}
            className={ESTILO_ENTREGAR}
          >
            Entregar
          </button>
        )
      : t.hrefAsignar && (
          <Link href={t.hrefAsignar} title={`Abrir ${t.modelo} en el panel de asignación`} className={ESTILO_ASIGNAR}>
            Asignar
          </Link>
        );

  return (
    <li className={`flex flex-col gap-2.5 ${ancho}`}>
      <div className="relative">
        {t.imagen ? (
          <ImagenAmpliable
            url={t.imagen.url}
            urlGrande={t.imagen.urlGrande}
            alt={`Imagen de ${t.modelo}`}
            className="aspect-[4/3] w-full rounded-lg! p-1"
            ajuste="contain"
          />
        ) : (
          <span aria-hidden="true" title="Sin imagen" className="block aspect-[4/3] w-full rounded-lg bg-slate-100" />
        )}
        {t.conteos && (
          <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-white/90 p-0.5">
            <AnillosConcentricos conteos={t.conteos} tamano="size-9" />
          </span>
        )}
      </div>

      <div
        title={`${t.modelo} · ${t.ot ? `O.T. ${t.ot}` : "Sin O.T."} · ${t.numeroPm}`}
        className="flex min-w-0 flex-1 flex-col gap-0.5"
      >
        <Link
          href={t.hrefModelo}
          title={`Ver ${t.modelo} en el panel de asignación`}
          className="-my-1.5 line-clamp-2 py-1.5 text-base font-medium leading-snug text-slate-900 hover:underline"
        >
          {t.modelo}
        </Link>
        {/* Equipo · proceso · parte: en dos renglones si hace falta (la tarjeta es angosta en celular). */}
        {t.subtitulo && <p className="line-clamp-2 break-words text-sm text-slate-500">{t.subtitulo}</p>}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
          <Link
            href={t.hrefPm}
            title={`Abrir el pedido ${t.numeroPm}`}
            // Más alto para el dedo sin mover el renglón (el margen negativo lo compensa). Solo crece
            // hacia abajo: hacia arriba tapaba la orilla del nombre del mueble.
            className="-mb-3 inline-block pb-3 text-slate-500 underline-offset-2 transition-colors hover:text-slate-900 hover:underline"
          >
            {t.pmCorto}
          </Link>
          {!t.avance && <span className="tabular-nums text-slate-500">{t.piezas}</span>}
        </div>
        {(t.plazo || noEsta) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium">
            {t.plazo && (
              <span
                className={t.plazo.nivel === "vencido" ? "text-rose-700" : "text-amber-700"}
                title="Según la fecha de entrega del PM"
              >
                {t.plazo.texto}
              </span>
            )}
            {noEsta && (
              <span className="text-rose-700" title="Producción marcó que no está en el taller">
                ✕ No está
              </span>
            )}
          </div>
        )}
      </div>

      {t.avance && t.asignacionId && <ResumenAvance avance={t.avance} alAbrir={() => setAbierta(true)} />}
      {accion && <div>{accion}</div>}

      {t.avance && t.asignacionId && (
        <>
          {entregando && (
            <EntregarMueble
              t={t}
              avance={t.avance}
              asignacionId={t.asignacionId}
              hrefPartes={t.avance.porPartes ? t.hrefPanel : null}
              alCerrar={() => setEntregando(false)}
            />
          )}
          <VistaPreviaMueble
            t={t}
            avance={t.avance}
            asignacionId={t.asignacionId}
            abierta={abierta}
            alCerrar={cerrar}
            marca={marca}
            puedeEditar={puedeEditar}
            alGuardar={setMarca}
          />
        </>
      )}
    </li>
  );
}

// Lo entregado por el equipo ("5 de 13 PZA" y una barra). Al tocarlo se abre la vista previa del mueble.
function ResumenAvance({ avance: a, alAbrir }: { avance: AvanceTarjeta; alAbrir: () => void }) {
  const color = a.pct >= 100 ? COLOR_ESTADO.terminado : COLOR_ESTADO.en_proceso;
  const unidad = a.unidad ? ` ${a.unidad}` : "";
  return (
    <button
      type="button"
      onClick={alAbrir}
      aria-haspopup="dialog"
      title="Ver vista previa"
      className="group -mx-2 flex cursor-pointer flex-col gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <span className="flex items-center justify-between text-sm tabular-nums text-slate-700">
        <span>
          <span className="font-medium text-slate-900">{a.entregado}</span> de {a.total}
          {unidad}
        </span>
        <Chevron className="size-4 -rotate-90 text-slate-400 transition-colors group-hover:text-slate-900" />
      </span>
      <Barra pct={a.pct} color={color} />
    </button>
  );
}

function Barra({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </span>
  );
}
