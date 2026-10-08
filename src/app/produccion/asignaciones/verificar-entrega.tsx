"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { mensajeErrorRpc } from "@/lib/produccion/asignaciones";

// El trabajador revisó las piezas de una entrega y cumplen: pasan a Calidad.
export default function VerificarEntrega({ id }: { id: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verificar() {
    setEnviando(true);
    setError(null);
    const { error } = await createClient().rpc("verificar_entrega_produccion", { p_entrega_id: id });
    setEnviando(false);
    if (error) {
      setError(mensajeErrorRpc(error.message));
      return;
    }
    avisar("Entrega verificada y enviada a Calidad");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={verificar}
        disabled={enviando}
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
      >
        {enviando ? "Guardando…" : "Cumple: mandar a Calidad"}
      </button>
      {error && <p className="max-w-56 text-right text-xs text-red-700">{error}</p>}
    </div>
  );
}
