"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanoLink } from "@/lib/planos/planos-por-item";

// Botón "Plano" junto al modelo: abre un panel con las especificaciones
// leídas del cuadro de datos de cada plano y la ruta del PDF en el servidor
// de la empresa (el PDF no se guarda en la app; se abre desde ahí).
export default function PlanosItem({ planos }: { planos: PlanoLink[] }) {
  const [abierto, setAbierto] = useState(false);
  if (planos.length === 0) return null;

  const origen = planos[0].de_otro_pm;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
      >
        Plano{planos.length > 1 ? `s (${planos.length})` : ""}
        {origen && <span className="font-normal text-slate-400"> · de {origen}</span>}
        {planos.every((p) => p.cancelada) && (
          <span className="font-normal text-rose-500"> · cancelada</span>
        )}
      </button>
      {abierto && <PanelPlanos planos={planos} onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

function PanelPlanos({ planos, onCerrar }: { planos: PlanoLink[]; onCerrar: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCerrar}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl bg-white text-left text-sm font-normal text-slate-700 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            {planos.length > 1 ? `Planos (${planos.length})` : "Plano"} — {planos[0].modelo_carpeta}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col divide-y divide-slate-100">
          {planos.map((p) => (
            <FichaPlano key={p.id} plano={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FichaPlano({ plano: p }: { plano: PlanoLink }) {
  const datos: [string, string | number | null][] = [
    ["Descripción", p.descripcion],
    ["Especificación", p.especificacion],
    ["Hojas", p.paginas],
    ["Escala", p.escala],
    ["Dibujó", p.dibujo],
    ["Verificó", p.verifico],
    ["Fecha", p.fecha_plano],
  ];
  const conValor = datos.filter(([, v]) => v !== null && v !== "");

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div>
        <p className="font-medium text-slate-900">{p.nombre_archivo}</p>
        <p className="text-xs text-slate-500">
          Carpeta {p.modelo_carpeta}
          {p.de_otro_pm ? ` · de ${p.de_otro_pm}` : ""}
          {p.cancelada ? " · marcada CANCELADA en el servidor" : ""}
        </p>
      </div>

      {p.error_lectura && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          No se pudieron leer los datos de este PDF ({p.error_lectura}). Ábrelo desde el servidor.
        </p>
      )}

      {conValor.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {conValor.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="contents">
              <dt className="text-slate-500">{etiqueta}</dt>
              <dd className="text-slate-900">{valor}</dd>
            </div>
          ))}
        </dl>
      )}

      {p.acabados.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-slate-500">Acabados</span>
          {p.acabados.map((a) => (
            <span key={a} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {a}
            </span>
          ))}
        </div>
      )}

      {p.notas.length > 0 && (
        <div>
          <p className="text-slate-500">Notas del plano</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
            {p.notas.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <RutaServidor ruta={p.ruta} />
    </div>
  );
}

// El navegador no deja abrir archivos de la red desde una página web, así
// que se copia la ruta para pegarla en el Explorador de archivos.
function RutaServidor({ ruta }: { ruta: string }) {
  const [estado, setEstado] = useState<"listo" | "copiado" | "manual">("listo");
  const rutaRef = useRef<HTMLParagraphElement>(null);

  // Primero el método clásico (síncrono, dentro del click): el portapapeles
  // moderno puede estar bloqueado o, en algunos navegadores, quedarse
  // esperando un permiso que nunca llega. Si ninguno funciona, la ruta queda
  // seleccionada para copiarla con Ctrl+C.
  async function copiar() {
    let ok = copiarConSeleccion(ruta);
    if (!ok && navigator.clipboard) {
      ok = await Promise.race([
        navigator.clipboard.writeText(ruta).then(
          () => true,
          () => false
        ),
        new Promise<boolean>((resolver) => setTimeout(() => resolver(false), 1500)),
      ]);
    }
    if (!ok && rutaRef.current) {
      window.getSelection()?.selectAllChildren(rutaRef.current);
    }
    setEstado(ok ? "copiado" : "manual");
    setTimeout(() => setEstado("listo"), 2500);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">Abrir desde el servidor</p>
      <p ref={rutaRef} className="mt-1 break-all font-mono text-xs text-slate-800 select-all">
        {ruta}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copiar}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
        >
          {estado === "copiado" ? "¡Ruta copiada!" : "Copiar ruta"}
        </button>
        <span className="text-xs text-slate-500">
          {estado === "manual"
            ? "No se pudo copiar automáticamente: la ruta quedó seleccionada, presiona Ctrl + C."
            : "Pégala en la barra del Explorador de archivos o en Win + R y presiona Enter."}
        </span>
      </div>
    </div>
  );
}

function copiarConSeleccion(texto: string): boolean {
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
