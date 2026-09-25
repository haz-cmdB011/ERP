"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface Resumen {
  actualizadas: number;
  yaExistian: number;
  fallidas: number;
  itemsSinCoincidencia: number;
  imagenesSinRegistro: number;
}

// Las imágenes se guardan a 200 px al cargar el Excel y el archivo archivado
// ya no las trae, así que para verlas en alta calidad (zoom) hay que volver a
// leerlas del Excel original. Esto no crea una versión nueva ni toca datos,
// ítems o folios: solo agrega la versión grande junto a cada miniatura.
export default function MejorarImagenes({
  pedidoId,
  numeroVersion,
}: {
  pedidoId: string;
  numeroVersion: number;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  async function enviar() {
    if (!archivo) return;
    setEnviando(true);
    setError(null);
    setResumen(null);
    try {
      const datos = new FormData();
      datos.append("file", archivo);
      datos.append("version", String(numeroVersion));
      const res = await fetch(`/api/planeacion/pedidos/${pedidoId}/imagenes-hd`, {
        method: "POST",
        body: datos,
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(cuerpo.error ?? "No se pudieron mejorar las imágenes.");
        return;
      }
      setResumen(cuerpo as Resumen);
      setArchivo(null);
      if (entrada.current) entrada.current.value = "";
      router.refresh();
    } catch {
      setError("Error de red al subir el archivo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-fit rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
      >
        Mejorar calidad de las imágenes
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">
            Mejorar calidad de las imágenes (versión v{numeroVersion})
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Sube de nuevo <strong>el mismo Excel</strong> con el que se cargó esta versión (el
            original, con las imágenes). Se guardan versiones en alta resolución para el zoom. No
            crea una versión nueva ni cambia datos, ítems ni folios; si algún ítem no coincide con
            el archivo, se omite.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          aria-label="Cerrar"
          className="text-slate-400 hover:text-slate-600"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={entrada}
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] ?? null);
            setError(null);
            setResumen(null);
          }}
          className="text-xs text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!archivo || enviando}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {enviando ? "Procesando imágenes..." : "Mejorar imágenes"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          {error}
        </p>
      )}
      {resumen && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
          Listo: {resumen.actualizadas} imagen(es) mejorada(s)
          {resumen.yaExistian > 0 ? `, ${resumen.yaExistian} ya estaban en alta calidad` : ""}
          {resumen.itemsSinCoincidencia > 0
            ? `, ${resumen.itemsSinCoincidencia} ítem(s) omitido(s) por no coincidir`
            : ""}
          {resumen.fallidas > 0 ? `, ${resumen.fallidas} con error` : ""}.
        </p>
      )}
    </div>
  );
}
