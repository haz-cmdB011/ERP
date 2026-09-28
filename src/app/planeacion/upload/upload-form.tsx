"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Mismo límite que la ruta /api/planeacion/upload.
const MAX_FILE_BYTES = 40 * 1024 * 1024;

interface FilaError {
  fila: number;
  mensaje: string;
}

interface UploadOk {
  ok: true;
  cargaId: string;
  pedido_id: string;
  pedido_version_id: string;
  numero_version: number;
  items_mo: number;
  items_fu: number;
  // Filas con datos incompletos que se guardaron igual (ver parser).
  avisos?: FilaError[];
}

interface UploadError {
  error: string;
  detalles?: FilaError[];
  cargaId?: string;
}

type UploadResult = UploadOk | UploadError;

function esError(r: UploadResult): r is UploadError {
  return "error" in r;
}

export default function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<UploadResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setEnviando(true);
    setResultado(null);

    if (file.size > MAX_FILE_BYTES) {
      setResultado({ error: "El archivo excede el tamaño máximo permitido (40 MB)." });
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    try {
      // 1. El Excel va directo del navegador a Storage: Vercel no deja pasar
      //    peticiones de más de 4.5 MB, y los Excel con imágenes las pasan.
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setResultado({ error: "Tu sesión expiró. Vuelve a iniciar sesión." });
        return;
      }
      const conMacros = file.name.toLowerCase().endsWith(".xlsm");
      if (!conMacros && !file.name.toLowerCase().endsWith(".xlsx")) {
        setResultado({ error: "Solo se aceptan archivos de Excel .xlsx o .xlsm." });
        return;
      }
      const storagePath = `${user.id}/entrantes/${Date.now()}.${conMacros ? "xlsm" : "xlsx"}`;
      const { error: subidaError } = await supabase.storage
        .from("cargas-excel")
        .upload(storagePath, file, {
          contentType: conMacros
            ? "application/vnd.ms-excel.sheet.macroEnabled.12"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: false,
        });
      if (subidaError) {
        setResultado({ error: `No se pudo subir el archivo: ${subidaError.message}` });
        return;
      }

      // 2. El servidor lo toma de Storage y lo procesa.
      const res = await fetch("/api/planeacion/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath, nombreArchivo: file.name }),
      });
      const data: UploadResult | null = await res.json().catch(() => null);
      setResultado(
        data ??
          ({
            error:
              res.status === 504
                ? "El archivo tardó demasiado en procesarse. Intenta de nuevo."
                : `El servidor respondió con un error (${res.status}).`,
          } satisfies UploadError)
      );
    } catch {
      setResultado({ error: "Error de red al subir el archivo." });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm"
          required
          className="text-sm"
        />
        <button
          type="submit"
          disabled={enviando}
          className="w-fit rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {enviando ? "Procesando..." : "Subir Excel de Planeación"}
        </button>
      </form>

      {resultado && esError(resultado) && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">{resultado.error}</p>
          {resultado.detalles && resultado.detalles.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {resultado.detalles.map((d, i) => (
                <li key={i}>
                  {d.fila > 0 ? `Fila ${d.fila}: ` : ""}
                  {d.mensaje}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {resultado && !esError(resultado) && (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <p className="font-medium">
            Pedido ingerido correctamente (versión #{resultado.numero_version}).
          </p>
          <p>
            {resultado.items_mo} muebles (MO) y {resultado.items_fu} componentes
            (FU) registrados.
          </p>
          <Link
            href={`/planeacion/pedidos/${resultado.pedido_id}`}
            className="mt-2 inline-block underline"
          >
            Ver pedido →
          </Link>
        </div>
      )}

      {resultado && !esError(resultado) && resultado.avisos && resultado.avisos.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">
            Se cargó, pero revisa estos datos incompletos del Excel ({resultado.avisos.length}):
          </p>
          <ul className="mt-2 list-disc pl-5">
            {resultado.avisos.map((d, i) => (
              <li key={i}>
                {d.fila > 0 ? `Fila ${d.fila}: ` : ""}
                {d.mensaje}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
