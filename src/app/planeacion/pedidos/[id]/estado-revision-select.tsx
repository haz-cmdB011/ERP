"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EstadoRevision } from "@/lib/planeacion/estado-revision";

export default function EstadoRevisionSelect({
  itemId,
  estadoActual,
}: {
  itemId: string;
  estadoActual: EstadoRevision;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(valor: string) {
    const estado_revision = valor === "" ? null : valor;
    setGuardando(true);
    setError(null);

    const res = await fetch(`/api/planeacion/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado_revision }),
    });
    const data = await res.json().catch(() => ({}));

    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "Error desconocido.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <select
        value={estadoActual ?? ""}
        onChange={(e) => cambiar(e.target.value)}
        disabled={guardando}
        className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs disabled:opacity-50"
      >
        <option value="">Normal</option>
        <option value="en_revision">En revisión</option>
        <option value="cancelado">Cancelado</option>
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
