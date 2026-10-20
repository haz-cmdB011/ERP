"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { semanaDe, type Incidencia } from "@/lib/calidad/incidencias";
import { generarPdfCarta } from "@/lib/pdf/generar-pdf-carta";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";
import { diaLargo } from "./formato";

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{etiqueta}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function Texto({ titulo, texto }: { titulo: string; texto: string | null | undefined }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</h4>
      {texto ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-900">{texto}</p>
      ) : (
        <p className="text-sm text-slate-400">Sin escribir.</p>
      )}
    </section>
  );
}

// "2026-10-19T18:30:00Z" → "19 de octubre de 2026" (hora de la empresa).
function diaDeCierre(instante: string): string {
  const dia = new Date(instante).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  return diaLargo(dia);
}

// La hoja del reporte, con todos sus datos y su texto: es lo que se captura para armar el PDF.
function HojaReporte({ i, idHoja }: { i: Incidencia; idHoja: string }) {
  const semana = i.fecha ? semanaDe(i.fecha) : null;
  return (
    <div data-ficha-reporte={idHoja} className="flex w-[640px] flex-col gap-5 bg-white p-6 text-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Calidad · Reporte</p>
          <h3 className="text-lg font-semibold">{i.tipo}</h3>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            i.estado === "abierto"
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-emerald-300 bg-emerald-50 text-emerald-700"
          }`}
        >
          {i.estado === "abierto" ? "Abierto" : "Cerrado"}
        </span>
      </header>

      <dl className="grid grid-cols-3 gap-x-6 gap-y-3">
        <Dato etiqueta="Fecha">
          {i.fecha ? diaLargo(i.fecha) : "Sin fecha"}
          {semana && <span className="block text-xs text-slate-500">Semana {semana.numero}</span>}
        </Dato>
        <Dato etiqueta="Línea">{i.linea === "madera" ? "Madera" : "Metal"}</Dato>
        <Dato etiqueta="Auditó">{i.auditor ?? "—"}</Dato>
        <Dato etiqueta="Proyecto">{i.proyecto ?? "—"}</Dato>
        <Dato etiqueta="Muebles o piezas">{i.muebles.join(", ") || "—"}</Dato>
        <Dato etiqueta="Área que reporta">{i.areas_reporta.join(", ") || "—"}</Dato>
        <Dato etiqueta="Áreas involucradas">{i.areas.join(", ") || "—"}</Dato>
        <Dato etiqueta="Motivo">
          {i.motivo ?? "—"}
          <span className="block text-xs text-slate-500">{i.categoria_motivo}</span>
        </Dato>
        {i.estado === "cerrado" && i.cerrado_en && <Dato etiqueta="Cerrado el">{diaDeCierre(i.cerrado_en)}</Dato>}
      </dl>

      <Texto titulo="Descripción del reporte" texto={i.descripcion} />
      <Texto titulo="Solución" texto={i.solucion} />
      <Texto titulo="Control y seguimiento" texto={i.seguimiento} />
    </div>
  );
}

// Lo que se abre al tocar "Ver reporte": el PDF carta del reporte a pantalla completa. La hoja se
// maqueta fuera de la pantalla, se captura con el generador de PDF del proyecto y el resultado se
// muestra en el visor del navegador (la CSP permite marcos con blob:). Sin lector de PDF en el
// navegador (muchos celulares) quedan los botones de descargar y abrir en otra pestaña.
export default function VisorReporte({
  incidencia: i,
  onEditar,
  onCerrar,
}: {
  incidencia: Incidencia;
  onEditar: () => void;
  onCerrar: () => void;
}) {
  const idHoja = useMemo(() => `hoja-${i.id}`, [i.id]);
  const nombre = useMemo(
    () =>
      `${nombreArchivoSeguro(
        `No conformidad ${i.fecha ?? "sin fecha"} ${i.proyecto ?? ""} ${i.muebles[0] ?? ""}`.trim().slice(0, 120)
      )}.pdf`,
    [i.fecha, i.proyecto, i.muebles]
  );
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlActual = useRef<string | null>(null);

  // Arma el PDF al abrir. La dirección temporal se libera al cerrar.
  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        // Espera a que la hoja oculta se pinte antes de capturarla.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const hoja = document.querySelector<HTMLElement>(`[data-ficha-reporte="${idHoja}"]`);
        if (!hoja) throw new Error("sin hoja");
        const pdf = await generarPdfCarta([hoja], nombre, { salida: "blob" });
        if (!vigente || !pdf) return;
        urlActual.current = URL.createObjectURL(pdf);
        setUrl(urlActual.current);
      } catch {
        if (vigente) setError("No se pudo generar el PDF.");
      }
    })();
    return () => {
      vigente = false;
      if (urlActual.current) URL.revokeObjectURL(urlActual.current);
      urlActual.current = null;
    };
  }, [idHoja, nombre, i]);

  // Esc cierra; con el visor abierto la página de abajo no se desplaza.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = antes;
    };
  }, [onCerrar]);

  const boton =
    "inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100" role="dialog" aria-modal="true" aria-label="Reporte en PDF">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <p className="mr-auto min-w-0 truncate text-sm font-semibold text-slate-900" title={nombre}>
          {nombre}
        </p>
        {url && (
          <>
            <a href={url} download={nombre} className={boton}>
              Descargar
            </a>
            <a href={url} target="_blank" rel="noopener" className={boton}>
              Abrir en otra pestaña
            </a>
          </>
        )}
        <button type="button" onClick={onEditar} className={boton}>
          Editar reporte
        </button>
        <button type="button" onClick={onCerrar} className={boton}>
          Cerrar ✕
        </button>
      </div>

      {url ? (
        <iframe title={nombre} src={url} className="min-h-0 w-full flex-1 bg-white" />
      ) : (
        <div role="status" className="flex flex-1 items-center justify-center text-sm text-slate-500">
          {error ?? "Generando el PDF…"}
        </div>
      )}

      {/* La hoja que se captura: fuera de la pantalla (no puede ser display:none, o no se pinta). */}
      <div aria-hidden="true" className="pointer-events-none fixed top-0 -left-[10000px]">
        <HojaReporte i={i} idHoja={idHoja} />
      </div>
    </div>
  );
}
