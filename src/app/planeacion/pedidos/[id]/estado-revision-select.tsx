"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EstadoRevision } from "@/lib/planeacion/estado-revision";

export default function EstadoRevisionSelect({
  itemId,
  estadoActual,
  motivoActual,
}: {
  itemId: string;
  estadoActual: EstadoRevision;
  motivoActual?: string | null;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function guardar(estado_revision: string | null, motivo_cancelacion?: string) {
    setGuardando(true);
    setError(null);

    const res = await fetch(`/api/planeacion/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado_revision, motivo_cancelacion }),
    });
    const data = await res.json().catch(() => ({}));

    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "Error desconocido.");
      return;
    }
    setPidiendoMotivo(false);
    setMotivo("");
    router.refresh();
  }

  function cambiar(valor: string) {
    if (valor === "cancelado") {
      // El motivo es obligatorio al cancelar: se pide antes de guardar,
      // en vez de guardar de inmediato como con los otros estados.
      setMotivo(motivoActual ?? "");
      setPidiendoMotivo(true);
      setError(null);
      return;
    }
    guardar(valor === "" ? null : valor);
  }

  if (pidiendoMotivo) {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo de la cancelación (obligatorio)"
          rows={2}
          className="w-40 rounded-lg border border-slate-300 p-1.5 text-xs focus:border-slate-400 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!motivo.trim()) {
                setError("Debes indicar el motivo.");
                return;
              }
              guardar("cancelado", motivo.trim());
            }}
            disabled={guardando}
            className="text-xs font-medium text-red-700 underline disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPidiendoMotivo(false);
              setMotivo("");
              setError(null);
            }}
            className="text-xs text-gray-500 underline"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <select
        value={estadoActual ?? ""}
        onChange={(e) => cambiar(e.target.value)}
        disabled={guardando}
        className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        <option value="">Normal</option>
        <option value="en_revision">En revisión</option>
        <option value="cancelado">Cancelado</option>
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
