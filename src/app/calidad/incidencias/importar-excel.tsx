"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/avisos";
import Modal, { estiloBotonPrimario, estiloBotonSecundario } from "@/app/produccion/asignaciones/modal";

interface Resumen {
  hojas: { nombre: string; linea: string; filas: number }[];
  hojasIgnoradas: string[];
  leidas: number;
  nuevas: number;
  sinCambios: number;
  actualizar: number;
  cambiosPorCampo: { campo: string; filas: number }[];
  muestraActualizar: { etiqueta: string; campos: string[]; cierra: boolean }[];
  cerradasEnLaApp: number;
  repetidasPorContenido: number;
  omitidas: number;
  detalleOmitidas: { donde: string; motivo: string }[];
  avisos: { aviso: string; filas: number }[];
  muestra: { fecha: string | null; linea: string; tipo: string; proyecto: string | null; muebles: string[] }[];
  agregadas: number;
  actualizadas: number;
}

const NOMBRE_LINEA: Record<string, string> = { madera: "Madera", metal: "Metal" };

function fechaCorta(f: string | null): string {
  if (!f) return "sin fecha";
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a}`;
}

// Botón "Importar Excel" de No conformidades: se elige el Excel de control (hojas MADERA y METAL), se
// revisa qué trae de nuevo y qué cambió y, al confirmar, se agregan los reportes nuevos y se actualizan los
// que el Excel trae distintos (por ejemplo, ya cerrados). Repetirlo no duplica nada, una celda vacía no borra
// lo que ya hay y un reporte cerrado en la pantalla no se vuelve a abrir.
export default function ImportarExcel() {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    if (revisando || importando) return;
    setAbierto(false);
    setArchivo(null);
    setResumen(null);
    setError(null);
  }

  async function enviar(modo: "simular" | "aplicar", file: File): Promise<Resumen | null> {
    const formulario = new FormData();
    formulario.append("archivo", file);
    try {
      const r = await fetch(`/api/calidad/incidencias/importar?modo=${modo}`, { method: "POST", body: formulario });
      const cuerpo = (await r.json().catch(() => null)) as (Resumen & { error?: string }) | null;
      if (!r.ok || !cuerpo) {
        setError(cuerpo?.error ?? "No se pudo leer el archivo. Inténtalo de nuevo.");
        return null;
      }
      return cuerpo;
    } catch {
      setError("No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.");
      return null;
    }
  }

  async function revisar(file: File) {
    setArchivo(file);
    setResumen(null);
    setError(null);
    setRevisando(true);
    const r = await enviar("simular", file);
    setRevisando(false);
    if (r) setResumen(r);
  }

  async function importar() {
    if (!archivo) return;
    setImportando(true);
    setError(null);
    const r = await enviar("aplicar", archivo);
    setImportando(false);
    if (!r) return;
    const partes = [
      r.agregadas > 0 ? `${r.agregadas} nuevas` : null,
      r.actualizadas > 0 ? `${r.actualizadas} actualizadas` : null,
    ].filter(Boolean);
    avisar(partes.length ? `No conformidades importadas: ${partes.join(" y ")}.` : "No había nada que importar.", "exito");
    setAbierto(false);
    setArchivo(null);
    setResumen(null);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-brand-50 max-md:min-h-11"
      >
        Importar Excel
      </button>
      {abierto && (
        <Modal
          titulo="Importar Excel de control"
          subtitulo="Agrega los reportes nuevos del Excel y actualiza los que cambiaron (por ejemplo, ya cerrados)."
          onCerrar={cerrar}
        >
          <div className="flex flex-col gap-3">
            <input
              ref={entrada}
              type="file"
              accept=".xlsx,.xlsm"
              disabled={revisando || importando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void revisar(f);
              }}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
              aria-label="Excel de control de no conformidades"
            />
            <p className="text-xs text-slate-500">
              Usa las hojas «MADERA» y «METAL» del libro (de cualquier año). Cada reporte se agrega una sola vez, aunque
              subas el archivo muchas veces. Una celda vacía del Excel no borra lo que ya hay.
            </p>

            {revisando && <p className="text-sm text-slate-600">Revisando el archivo…</p>}

            {error && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}

            {resumen && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                    <div className="text-xl font-semibold text-emerald-800">{resumen.nuevas}</div>
                    <div className="text-xs text-emerald-800">nuevas</div>
                  </div>
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-2">
                    <div className="text-xl font-semibold text-sky-800">{resumen.actualizar}</div>
                    <div className="text-xs text-sky-800">se actualizan</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <div className="text-xl font-semibold text-slate-800">{resumen.sinCambios + resumen.repetidasPorContenido}</div>
                    <div className="text-xs text-slate-600">sin cambios</div>
                  </div>
                  <div className={`rounded-lg border p-2 ${resumen.omitidas ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                    <div className={`text-xl font-semibold ${resumen.omitidas ? "text-amber-800" : "text-slate-800"}`}>{resumen.omitidas}</div>
                    <div className={`text-xs ${resumen.omitidas ? "text-amber-800" : "text-slate-600"}`}>con problema</div>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  Hojas leídas: {resumen.hojas.map((h) => `${h.nombre} (${h.filas})`).join(", ")}.
                  {resumen.hojasIgnoradas.length > 0 && ` Se ignoran: ${resumen.hojasIgnoradas.join(", ")}.`}
                  {resumen.repetidasPorContenido > 0 &&
                    ` ${resumen.repetidasPorContenido} ya estaban con otro número de fila y no se vuelven a cargar.`}
                </p>

                {resumen.actualizar > 0 && (
                  <div>
                    <p className="text-sm font-medium text-sky-800">Lo que cambia en reportes ya cargados</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {resumen.cambiosPorCampo.map((c) => `${c.campo}: ${c.filas}`).join(" · ")}
                    </p>
                    <ul className="mt-1 flex flex-col gap-1 text-sm text-slate-700">
                      {resumen.muestraActualizar.map((m, i) => (
                        <li key={i} className="rounded-md bg-sky-50 px-2 py-1">
                          {m.etiqueta}: {m.cierra ? "se cierra" : m.campos.join(", ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {resumen.cerradasEnLaApp > 0 && (
                  <p className="text-xs text-slate-500">
                    {resumen.cerradasEnLaApp} {resumen.cerradasEnLaApp === 1 ? "reporte sigue abierto" : "reportes siguen abiertos"} en
                    el Excel pero ya se cerraron aquí: se dejan cerrados.
                  </p>
                )}

                {resumen.muestra.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-700">Algunas de las nuevas</p>
                    <ul className="mt-1 flex flex-col gap-1 text-sm text-slate-700">
                      {resumen.muestra.map((m, i) => (
                        <li key={i} className="rounded-md bg-slate-50 px-2 py-1">
                          {fechaCorta(m.fecha)} · {NOMBRE_LINEA[m.linea] ?? m.linea} · {m.tipo}
                          {m.proyecto ? ` · ${m.proyecto}` : ""}
                          {m.muebles.length > 0 ? ` · ${m.muebles.join(", ")}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {resumen.omitidas > 0 && (
                  <div>
                    <p className="text-sm font-medium text-amber-800">Filas que no se importan</p>
                    <ul className="mt-1 flex flex-col gap-1 text-sm text-slate-700">
                      {resumen.detalleOmitidas.map((o, i) => (
                        <li key={i} className="rounded-md bg-amber-50 px-2 py-1">
                          {o.donde}: {o.motivo}
                        </li>
                      ))}
                    </ul>
                    {resumen.omitidas > resumen.detalleOmitidas.length && (
                      <p className="mt-1 text-xs text-slate-500">…y {resumen.omitidas - resumen.detalleOmitidas.length} más.</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Corrígelas en el Excel y vuelve a importar: se agregan sin duplicar.</p>
                  </div>
                )}

                {resumen.avisos.length > 0 && (
                  <details className="text-sm text-slate-700">
                    <summary className="cursor-pointer font-medium">Datos vacíos que conviene revisar</summary>
                    <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
                      {resumen.avisos.map((a) => (
                        <li key={a.aviso}>
                          {a.aviso}: {a.filas} {a.filas === 1 ? "fila" : "filas"}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <div className="mt-1 flex justify-end gap-2">
              <button type="button" onClick={cerrar} disabled={revisando || importando} className={estiloBotonSecundario}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={importar}
                disabled={!resumen || resumen.nuevas + resumen.actualizar === 0 || revisando || importando}
                title={!resumen ? "Elige el Excel para ver qué trae de nuevo" : resumen.nuevas + resumen.actualizar === 0 ? "No hay nada nuevo ni cambiado que importar" : undefined}
                className={estiloBotonPrimario}
              >
                {importando ? "Importando…" : resumen && resumen.nuevas + resumen.actualizar > 0 ? `Importar (${resumen.nuevas} nuevas, ${resumen.actualizar} cambios)` : "Importar"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
