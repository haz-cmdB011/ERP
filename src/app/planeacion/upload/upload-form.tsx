"use client";

import Link from "next/link";
import { useRef, useState } from "react";

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

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/planeacion/upload", {
        method: "POST",
        body: formData,
      });
      const data: UploadResult = await res.json();
      setResultado(data);
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
          accept=".xlsx"
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
    </div>
  );
}
