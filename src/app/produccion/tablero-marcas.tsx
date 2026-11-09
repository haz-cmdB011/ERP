"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ImagenAmpliable from "@/components/imagen-ampliable";
import { formatoFechaHora, textoMarca } from "@/lib/produccion/historial-marcas";
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
import MarcaSeleccionable from "./marca-seleccionable";
import VistaPreviaMueble, { claseMarca } from "./vista-previa-mueble";

// Cada columna se distingue de un vistazo: caja teñida con borde marcado, encabezado de color sólido y
// una franja del mismo color en el borde izquierdo de sus tarjetas.
const ESTILO_COLUMNA: Record<Columna, { caja: string; cabecera: string; cuenta: string; franja: string }> = {
  por_asignar: {
    caja: "border-2 border-emerald-400 bg-emerald-100",
    cabecera: "bg-emerald-600 text-white",
    cuenta: "bg-white text-emerald-800",
    franja: "border-l-4 border-l-emerald-500",
  },
  sin_asignar: {
    caja: "border-2 border-rose-400 bg-rose-100",
    cabecera: "bg-rose-600 text-white",
    cuenta: "bg-white text-rose-800",
    franja: "border-l-4 border-l-rose-500",
  },
};

// Tablero separado por O.T.: cada O.T. es una sección que se pliega, con sus dos columnas, y cada
// tarjeta dice de qué PM es (solo "PM009-26" o "SDC-1"). Cada mueble (o asignación) es una tarjeta con
// su miniatura (que se amplía al tocarla), su nombre y los anillos de su modelo. En "Sin asignar" lleva
// el botón que abre el panel de asignación con ese mueble; en "Por asignar", el pase de lista del equipo
// y una vista previa de cómo va, que se abre en la misma tarjeta. Por omisión muestra lo más reciente
// que se trabajó; "Todos" lo muestra completo.
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
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});

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
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">Bitácora de producción</h2>
        {acciones}
      </header>
      <div className="flex min-w-0 flex-col gap-3 p-4">
        {hayMas && (
          <div role="group" aria-label="Qué muebles ver" className="flex flex-wrap gap-2">
            {[
              { activo: true, etiqueta: "Más recientes", cuantos: MAX_TARJETAS_RECIENTES },
              { activo: false, etiqueta: "Todos", cuantos: tarjetas.length },
            ].map((o) => (
              <button
                key={o.etiqueta}
                type="button"
                onClick={() => setSoloRecientes(o.activo)}
                aria-pressed={soloRecientes === o.activo}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                  soloRecientes === o.activo
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {o.etiqueta}
                <span className="text-xs tabular-nums opacity-75">{o.cuantos}</span>
              </button>
            ))}
          </div>
        )}

        {secciones.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-slate-500">No hay muebles en taller ni por asignar.</p>
        )}

        <div className="flex flex-col gap-4">
          {secciones.map((sec, i) => {
            const cuentas = conteosColumnas(sec.tarjetas);
            const plegada = estaPlegada(sec, i);
            return (
              <section key={sec.clave} aria-label={sec.titulo} className="min-w-0 rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPlegadas((p) => ({ ...p, [sec.clave]: !plegada }))}
                      aria-expanded={!plegada}
                      aria-label={`${plegada ? "Abrir" : "Plegar"} ${sec.titulo}`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-300 text-slate-600 hover:bg-brand-50"
                    >
                      <Chevron className={`h-4 w-4 transition-transform ${plegada ? "-rotate-90" : ""}`} />
                    </button>
                    {sec.hrefOt ? (
                      <Link href={sec.hrefOt} className="truncate text-base font-bold text-slate-900 hover:underline">
                        {sec.titulo}
                      </Link>
                    ) : (
                      <h3 className="truncate text-base font-bold text-slate-900">{sec.titulo}</h3>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5 text-xs font-semibold tabular-nums" aria-label="Cuántas hay en cada columna">
                    {COLUMNAS_TABLERO.map((c) => (
                      <span key={c.valor} className={`rounded-full px-2 py-0.5 ${ESTILO_COLUMNA[c.valor].cabecera}`} title={c.titulo}>
                        {cuentas[c.valor]}
                      </span>
                    ))}
                  </div>
                </div>

                {!plegada && (
                  <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
                    {COLUMNAS_TABLERO.map((c) => {
                      const lista = enColumna(sec.tarjetas, c.valor);
                      const llave = `${sec.clave}|${c.valor}`;
                      const visibles = abiertas[llave] ? lista : lista.slice(0, TARJETAS_POR_COLUMNA);
                      const estilo = ESTILO_COLUMNA[c.valor];
                      return (
                        <div key={c.valor} className={`flex min-h-32 min-w-0 flex-col gap-2 rounded-xl p-2.5 ${estilo.caja}`}>
                          <div className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${estilo.cabecera}`}>
                            <h4 className="text-sm font-semibold">{c.titulo}</h4>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${estilo.cuenta}`}>{lista.length}</span>
                          </div>

                          {lista.length === 0 ? (
                            <p className="px-1 py-4 text-center text-xs font-medium text-slate-500">Nada por aquí</p>
                          ) : (
                            <ul className="flex flex-col gap-2">
                              {visibles.map((t) => (
                                <TarjetaVista key={t.clave} t={t} franja={estilo.franja} puedeEditar={puedeEditar} />
                              ))}
                            </ul>
                          )}

                          {lista.length > TARJETAS_POR_COLUMNA && (
                            <button
                              type="button"
                              onClick={() => setAbiertas((a) => ({ ...a, [llave]: !a[llave] }))}
                              className="rounded-md px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white/70"
                            >
                              {abiertas[llave] ? "Ver menos" : `Ver todas (${lista.length})`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
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

function TarjetaVista({ t, franja, puedeEditar }: { t: TarjetaTablero; franja: string; puedeEditar: boolean }) {
  // La vista previa flotante y el pase de lista de la asignación. `marca` es la vigente (la de la tarjeta o la
  // que se marcó en la vista previa); `claveMarca` cambia al cerrarla para que la palomita de la tarjeta tome
  // lo marcado allá; `version` cambia con cada marca para volver a leer el registro.
  const [abierta, setAbierta] = useState(false);
  const [marca, setMarca] = useState(t.marca);
  const [claveMarca, setClaveMarca] = useState(0);
  const [version, setVersion] = useState(0);
  const [ultimoPase, setUltimoPase] = useState<{ marca: boolean | null; en: string } | null>(null);

  function registrar(nueva: boolean | null) {
    setMarca(nueva);
    setVersion((v) => v + 1);
    setUltimoPase({ marca: nueva, en: new Date().toISOString() });
  }
  function cerrar() {
    setAbierta(false);
    setClaveMarca((k) => k + 1);
  }

  return (
    <li className={`flex items-start gap-2.5 rounded-lg border border-slate-200 ${franja} bg-white p-2.5 shadow-sm`}>
      {t.imagen ? (
        <ImagenAmpliable url={t.imagen.url} urlGrande={t.imagen.urlGrande} alt={`Imagen de ${t.modelo}`} className="size-11" />
      ) : (
        <span aria-hidden="true" title="Sin imagen" className="size-11 shrink-0 rounded border border-dashed border-slate-200 bg-slate-50" />
      )}

      <div
        title={`${t.modelo} · ${t.ot ? `O.T. ${t.ot}` : "Sin O.T."} · ${t.numeroPm}`}
        className="flex min-w-0 flex-1 flex-col gap-1.5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={t.hrefModelo}
              title={`Ver ${t.modelo} en el panel de asignación`}
              className="block truncate text-sm font-semibold text-slate-900 hover:underline"
            >
              {t.modelo}
            </Link>
            {t.subtitulo && <p className="truncate text-xs text-slate-500">{t.subtitulo}</p>}
          </div>
          {t.conteos && <AnillosConcentricos conteos={t.conteos} tamano="size-14" />}
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={t.hrefPm}
              title={`Abrir el pedido ${t.numeroPm}`}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-medium text-slate-700 transition-colors hover:border-brand-400 hover:text-slate-900"
            >
              {t.pmCorto}
            </Link>
            {!t.avance && <span className="text-xs tabular-nums text-slate-600">{t.piezas}</span>}
          </div>

          {t.avance && t.asignacionId ? (
            <MarcaSeleccionable
              key={claveMarca}
              asignacionId={t.asignacionId}
              inicial={marca}
              notaInicial={t.nota}
              puedeEditar={puedeEditar}
              titulo={`${t.modelo}${t.subtitulo ? ` · ${t.subtitulo}` : ""}`}
              alGuardar={registrar}
            />
          ) : (
            t.hrefAsignar && (
              <Link
                href={t.hrefAsignar}
                title={`Abrir ${t.modelo} en el panel de asignación`}
                className="rounded-md border border-brand-600 px-3 py-1 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                Asignar
              </Link>
            )
          )}
        </div>

        {t.avance && t.asignacionId && (
          <>
            <ResumenAvance avance={t.avance} alAbrir={() => setAbierta(true)} />
            {ultimoPase && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600" role="status">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${claseMarca(ultimoPase.marca)}`}>{textoMarca(ultimoPase.marca)}</span>
                <span className="tabular-nums">Registrado {formatoFechaHora(ultimoPase.en)}</span>
              </p>
            )}
            <VistaPreviaMueble
              t={t}
              avance={t.avance}
              asignacionId={t.asignacionId}
              abierta={abierta}
              alCerrar={cerrar}
              marca={marca}
              puedeEditar={puedeEditar}
              version={version}
              alGuardar={registrar}
            />
          </>
        )}
      </div>
    </li>
  );
}

// Lo entregado por el equipo (una barra y "5 de 13 PZA"). Al tocarla se abre la vista previa del mueble.
function ResumenAvance({ avance: a, alAbrir }: { avance: AvanceTarjeta; alAbrir: () => void }) {
  const color = a.pct >= 100 ? COLOR_ESTADO.terminado : COLOR_ESTADO.en_proceso;
  const unidad = a.unidad ? ` ${a.unidad}` : "";
  return (
    <button
      type="button"
      onClick={alAbrir}
      aria-haspopup="dialog"
      title="Ver vista previa"
      className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <Barra pct={a.pct} color={color} />
      <span className="shrink-0 text-xs tabular-nums text-slate-700">
        <b className="font-semibold">{a.entregado}</b> de {a.total}
        {unidad}
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0 text-slate-500" aria-hidden="true">
        <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
      </svg>
    </button>
  );
}

function Barra({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </span>
  );
}
