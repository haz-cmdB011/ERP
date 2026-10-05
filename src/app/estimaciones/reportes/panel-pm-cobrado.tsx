"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AREAS_COBRO, type ResumenOt } from "@/lib/estimaciones/pm-cobrado";
import { ETIQUETA_AREA } from "@/lib/estimaciones/reporte-dashboard";
import BarraAvance from "../pm-cobrado/barra-avance";

function coincide(r: ResumenOt, texto: string): boolean {
  const t = texto.toLowerCase();
  return [r.ot, r.pms, r.proyecto].some((v) => (v ?? "").toLowerCase().includes(t));
}

function conDiferencias(r: ResumenOt): boolean {
  return r.excedidos > 0 || r.fueraDelPm > 0 || r.discrepanciasPendientes > 0;
}

// Contenido de la sección "PM contra cobrado" del dashboard (el título y el
// desplegable los pone SeccionDesplegable): avance global por área y las O.T.
// con su avance, con buscador y filtro de diferencias. El detalle por modelo de
// cada O.T. sigue en /estimaciones/pm-cobrado/<OT>.
export default function PanelPmCobrado({
  resumenes,
  error,
}: {
  resumenes: ResumenOt[];
  error: string | null;
}) {
  const [texto, setTexto] = useState("");
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  const global = useMemo(() => {
    const avance = {
      acabados: { cobrado: 0, base: 0 },
      armado: { cobrado: 0, base: 0 },
      electrificacion: { cobrado: 0, base: 0 },
    };
    for (const r of resumenes) {
      for (const a of AREAS_COBRO) {
        avance[a].cobrado += r.avance[a].cobrado;
        avance[a].base += r.avance[a].base;
      }
    }
    return avance;
  }, [resumenes]);

  const totalConDiferencias = useMemo(() => resumenes.filter(conDiferencias).length, [resumenes]);
  const visibles = useMemo(() => {
    const busqueda = texto.trim();
    return resumenes
      .filter((r) => !busqueda || coincide(r, busqueda))
      .filter((r) => !soloDiferencias || conDiferencias(r));
  }, [resumenes, texto, soloDiferencias]);

  return (
    <>
      <p className="text-sm text-slate-500">
        Cada área tiene su propio saldo; los reprocesos se pagan aparte y Electrificación se mide
        contra los muebles con iluminación. Entra a una O.T. para ver el detalle por modelo.
      </p>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          No se pudo cargar el PM contra cobrado: {error}
        </p>
      )}

      {!error && resumenes.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Todavía no hay PM cargados.
        </p>
      )}

      {resumenes.length > 0 && (
        <>
          <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
            {AREAS_COBRO.map((a) => (
              <BarraAvance key={a} etiqueta={ETIQUETA_AREA[a]} avance={global[a]} />
            ))}
            <p className="text-xs text-slate-500 sm:col-span-3">
              Avance de todas las O.T. ({resumenes.length}).{" "}
              {totalConDiferencias > 0 ? (
                <span className="font-medium text-rose-700">
                  {totalConDiferencias} con diferencias por revisar.
                </span>
              ) : (
                "Ninguna tiene diferencias."
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar O.T., PM o proyecto"
              aria-label="Buscar O.T., PM o proyecto"
              className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setSoloDiferencias(false)}
              className={`rounded border px-3 py-1 text-sm font-medium pointer-coarse:py-2 ${
                !soloDiferencias
                  ? "border-brand-600 bg-brand-500 text-on-brand"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Todos ({resumenes.length})
            </button>
            <button
              type="button"
              onClick={() => setSoloDiferencias(true)}
              className={`rounded border px-3 py-1 text-sm font-medium pointer-coarse:py-2 ${
                soloDiferencias
                  ? "border-rose-600 bg-rose-600 text-white"
                  : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
            >
              Con diferencias ({totalConDiferencias})
            </button>
          </div>

          {visibles.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
              {soloDiferencias && !texto.trim()
                ? "Ninguna O.T. tiene diferencias con lo cobrado."
                : "Ninguna O.T. coincide con la búsqueda."}
            </p>
          )}

          {visibles.map((r) => (
            <Link
              key={r.ot}
              href={`/estimaciones/pm-cobrado/${encodeURIComponent(r.ot)}`}
              className="group/ot flex flex-col gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:border-brand-300"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <span className="font-mono text-base font-semibold text-slate-900 group-hover/ot:text-brand-700">
                    O.T. {r.ot}
                  </span>
                  {r.proyecto && <span className="ml-2 text-sm text-slate-500">{r.proyecto}</span>}
                </div>
                <span className="text-xs text-slate-500">
                  {r.numPms} PM · {r.modelos} modelos · {r.piezasPm} piezas
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {AREAS_COBRO.map((a) => (
                  <BarraAvance key={a} etiqueta={ETIQUETA_AREA[a]} avance={r.avance[a]} />
                ))}
              </div>
              {conDiferencias(r) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {r.excedidos > 0 && (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700 ring-1 ring-rose-200">
                      {r.excedidos} {r.excedidos === 1 ? "modelo cobrado" : "modelos cobrados"} de
                      más
                    </span>
                  )}
                  {r.fueraDelPm > 0 && (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700 ring-1 ring-rose-200">
                      {r.fueraDelPm} {r.fueraDelPm === 1 ? "modelo" : "modelos"} fuera de la O.T.
                    </span>
                  )}
                  {r.discrepanciasPendientes > 0 && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200">
                      {r.discrepanciasPendientes}{" "}
                      {r.discrepanciasPendientes === 1 ? "discrepancia" : "discrepancias"} sin
                      decidir
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </>
      )}
    </>
  );
}
