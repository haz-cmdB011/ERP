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
        className="rounded-full bg-slate-900 px-3.5 py-1 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        {enviando ? "Guardando…" : "Cumple: mandar a Calidad"}
      </button>
      {error && <p className="max-w-56 text-right text-xs text-red-700">{error}</p>}
    </div>
  );
}
