"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cancelarRecibo, type TipoCualquierRecibo } from "@/lib/estimaciones/revision-db";

// Cancela un recibo pendiente. Para el maquilador es la forma de corregirlo:
// cancela y vuelve a capturarlo con el mismo folio (el folio cancelado deja
// de estar ocupado). La base decide si se permite.
export default function CancelarReciboBoton({
  tipo,
  reciboId,
  folio,
}: {
  tipo: TipoCualquierRecibo;
  reciboId: string;
  folio: string;
}) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelar() {
    if (
      !window.confirm(
        `¿Cancelar el recibo ${folio}? Podrás capturarlo de nuevo con el mismo folio.`
      )
    ) {
      return;
    }
    setTrabajando(true);
    setError(null);
    const { error } = await cancelarRecibo(createClient(), tipo, reciboId);
    setTrabajando(false);
    if (error) {
      setError(error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={() => void cancelar()}
        disabled={trabajando}
        className="text-xs font-medium text-slate-500 hover:text-rose-600 disabled:opacity-50"
      >
        {trabajando ? "Cancelando…" : "Cancelar"}
      </button>
      {error && <span className="max-w-[14rem] text-right text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
