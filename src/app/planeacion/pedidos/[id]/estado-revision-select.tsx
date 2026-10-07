"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { avisar } from "@/components/avisos";
import DialogoMotivo from "@/components/dialogo-motivo";
import { ESTADO_REVISION_LABELS, type EstadoRevision } from "@/lib/planeacion/estado-revision";

async function guardarEstado(
  itemId: string,
  estado: EstadoRevision,
  motivo?: string
): Promise<string | null> {
  const res = await fetch(`/api/planeacion/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado_revision: estado, motivo_cancelacion: motivo }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? null : (data.error ?? "Error desconocido.");
}

// Lo que se dice en el aviso tras el cambio.
function textoCambio(etiqueta: string, estado: EstadoRevision): string {
  if (estado === "en_revision") return `${etiqueta} marcado en revisión.`;
  if (estado === "cancelado") return `${etiqueta} cancelado.`;
  return `${etiqueta} vuelto a normal.`;
}

// Cambia el estado de revisión de un ítem. Cada cambio avisa y trae "Deshacer"
// (vuelve al estado y motivo anteriores); cancelar pide el motivo en una ventana.
export default function EstadoRevisionSelect({
  itemId,
  estadoActual,
  motivoActual,
  etiqueta = "Ítem",
}: {
  itemId: string;
  estadoActual: EstadoRevision;
  motivoActual?: string | null;
  // Cómo se nombra el ítem en el aviso ("Ítem 12").
  etiqueta?: string;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);

  async function deshacer(estado: EstadoRevision, motivo: string | null | undefined) {
    // Un ítem que estaba cancelado necesita su motivo para restaurarse.
    if (estado === "cancelado" && !motivo?.trim()) {
      avisar("No se puede deshacer: el ítem cancelado no tenía motivo registrado.", "error");
      return;
    }
    const fallo = await guardarEstado(itemId, estado, motivo ?? undefined);
    if (fallo) {
      avisar(fallo, "error");
      return;
    }
    avisar("Cambio deshecho.", "info");
    router.refresh();
  }

  async function guardar(estado: EstadoRevision, motivo?: string) {
    setGuardando(true);
    setError(null);
    const fallo = await guardarEstado(itemId, estado, motivo);
    setGuardando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    setPidiendoMotivo(false);
    avisar(textoCambio(etiqueta, estado), "exito", {
      etiqueta: "Deshacer",
      alHacer: () => deshacer(estadoActual, motivoActual),
    });
    router.refresh();
  }

  function cambiar(valor: string) {
    if (valor === "cancelado") {
      // El motivo es obligatorio al cancelar: se pide antes de guardar, en vez
      // de guardar de inmediato como con los otros estados.
      setError(null);
      setPidiendoMotivo(true);
      return;
    }
    void guardar(valor === "" ? null : (valor as EstadoRevision));
  }

  return (
    <div>
      <select
        value={estadoActual ?? ""}
        onChange={(e) => cambiar(e.target.value)}
        disabled={guardando}
        aria-label={`Estado de ${etiqueta}`}
        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 pointer-coarse:py-2 pointer-coarse:text-sm"
      >
        <option value="">Normal</option>
        <option value="en_revision">{ESTADO_REVISION_LABELS.en_revision}</option>
        <option value="cancelado">{ESTADO_REVISION_LABELS.cancelado}</option>
      </select>
      {error && !pidiendoMotivo && <p className="text-xs text-red-600">{error}</p>}
      {pidiendoMotivo && (
        <DialogoMotivo
          titulo={`Cancelar ${etiqueta.toLowerCase()}`}
          descripcion="Queda marcado como cancelado y se ve en Cancelados. Puedes deshacerlo."
          etiquetaConfirmar="Cancelar ítem"
          motivoInicial={motivoActual ?? ""}
          enviando={guardando}
          error={error}
          onConfirmar={(motivo) => void guardar("cancelado", motivo)}
          onCancelar={() => setPidiendoMotivo(false)}
        />
      )}
    </div>
  );
}
