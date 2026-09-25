"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Lo ve quien edita en Planeación (ver page.tsx). Reutiliza el RPC de papelera
// de Producción (solicitar_eliminacion_item), que ahora también acepta a
// Planeación. El ítem eliminado se ve —y se puede restaurar— en
// /produccion/cancelados; el borrado definitivo sigue en la Papelera de
// Producción.
export default function EliminarItemBoton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar() {
    setEnviando(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("solicitar_eliminacion_item", {
      p_item_id: itemId,
    });
    setEnviando(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setConfirmando(false);
    router.refresh();
  }

  if (confirmando) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-gray-600">
          ¿Enviar a la papelera? Se puede restaurar desde Producción → Cancelados.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={ejecutar}
            disabled={enviando}
            className="text-xs font-medium text-red-700 underline disabled:opacity-50"
          >
            {enviando ? "Eliminando..." : "Sí, eliminar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
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
    <button
      type="button"
      onClick={() => setConfirmando(true)}
      className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
    >
      Eliminar
    </button>
  );
}
