"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cancelarRecibo, type TipoCualquierRecibo } from "@/lib/estimaciones/revision-db";
import { avisar } from "@/components/avisos";
import ConfirmDialog from "@/components/confirm-dialog";

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
  const [confirmando, setConfirmando] = useState(false);

  async function cancelar() {
    setTrabajando(true);
    setError(null);
    const { error } = await cancelarRecibo(createClient(), tipo, reciboId);
    setTrabajando(false);
    setConfirmando(false);
    if (error) {
      setError(error);
      return;
    }
    avisar(`Recibo ${folio} cancelado.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        disabled={trabajando}
        className="text-xs font-medium text-slate-500 hover:text-rose-600 disabled:opacity-50"
      >
        {trabajando ? "Cancelando…" : "Cancelar"}
      </button>
      {error && <span className="max-w-[14rem] text-right text-[11px] text-rose-600">{error}</span>}
      <ConfirmDialog
        open={confirmando}
        title={`Cancelar el recibo ${folio}`}
        message="Podrás capturarlo de nuevo con el mismo folio."
        confirmLabel="Cancelar recibo"
        cancelLabel="Volver"
        destructive
        busy={trabajando}
        onConfirm={() => void cancelar()}
        onCancel={() => setConfirmando(false)}
      />
    </div>
  );
}
