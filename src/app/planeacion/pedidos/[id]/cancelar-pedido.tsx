"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface CancelacionPedido {
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
}

// Cancelar/reactivar el pedido (PM) completo — a diferencia de la
// cancelación por ítem (estado_revision), esto cascada a TODOS los ítems
// del pedido vía el RPC cancelar_pedido (ver migración
// cancelacion_pedidos_items).
export default function CancelarPedido({
  pedidoId,
  cancelacion,
  puedeEditar,
}: {
  pedidoId: string;
  cancelacion: CancelacionPedido;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [confirmandoReactivar, setConfirmandoReactivar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmarCancelacion() {
    if (!motivo.trim()) {
      setErrorMotivo(true);
      return;
    }
    setEnviando(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("cancelar_pedido", {
      p_pedido_id: pedidoId,
      p_motivo: motivo.trim(),
    });
    setEnviando(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setPidiendoMotivo(false);
    setMotivo("");
    router.refresh();
  }

  async function confirmarReactivacion() {
    setEnviando(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("reactivar_pedido", {
      p_pedido_id: pedidoId,
    });
    setEnviando(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setConfirmandoReactivar(false);
    router.refresh();
  }

  if (cancelacion.cancelado_en) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
        <p className="font-medium text-rose-800">
          Pedido cancelado el {new Date(cancelacion.cancelado_en).toLocaleDateString("es-MX")}
        </p>
        {cancelacion.motivo_cancelacion && (
          <p className="mt-1 text-rose-700">Motivo: {cancelacion.motivo_cancelacion}</p>
        )}
        {puedeEditar && (
          <div className="mt-2">
            {confirmandoReactivar ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-700">¿Reactivar este pedido?</span>
                <button
                  type="button"
                  onClick={confirmarReactivacion}
                  disabled={enviando}
                  className="text-xs font-medium text-blue-700 underline disabled:opacity-50"
                >
                  {enviando ? "Reactivando..." : "Sí, reactivar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoReactivar(false)}
                  className="text-xs text-gray-500 underline"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoReactivar(true)}
                className="text-xs font-medium text-blue-700 underline"
              >
                Reactivar pedido
              </button>
            )}
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (!puedeEditar) return null;

  if (pidiendoMotivo) {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-600">
          Se cancelará el pedido completo y todos sus ítems.
        </p>
        <textarea
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            if (e.target.value.trim()) setErrorMotivo(false);
          }}
          placeholder="Motivo de la cancelación (obligatorio)"
          rows={3}
          className={`rounded border p-2 text-sm ${errorMotivo ? "border-red-400" : "border-gray-300"}`}
        />
        {errorMotivo && <p className="text-xs text-red-600">Debes indicar el motivo.</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={confirmarCancelacion}
            disabled={enviando}
            className="text-xs font-medium text-red-700 underline disabled:opacity-50"
          >
            {enviando ? "Cancelando..." : "Confirmar cancelación"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPidiendoMotivo(false);
              setMotivo("");
              setErrorMotivo(false);
            }}
            className="text-xs text-gray-500 underline"
          >
            Cerrar
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPidiendoMotivo(true)}
      className="w-fit rounded border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
    >
      Cancelar pedido
    </button>
  );
}
