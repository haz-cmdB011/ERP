"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { decidirDiscrepanciaElectrificacion } from "@/lib/estimaciones/recibos-electrificacion-db";

// Acepta o rechaza el motivo de un descuadre con el PM. Rechazar exige explicar
// por qué (esa nota es el reporte que ve quien capturó el recibo). La base
// valida además el rol (desarrollador o administrador de Estimaciones).
export default function DecidirBotones({ id }: { id: string }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decidir(decision: "aceptada" | "rechazada") {
    const nota =
      window.prompt(
        decision === "rechazada"
          ? "¿Por qué no se acepta el motivo? (obligatorio, lo verá quien capturó el recibo)"
          : "Nota de aceptación (opcional)"
      ) ?? null;
    if (nota === null) return;
    if (decision === "rechazada" && !nota.trim()) {
      setError("Para rechazar hay que explicar por qué.");
      return;
    }
    setTrabajando(true);
    setError(null);
    const { error } = await decidirDiscrepanciaElectrificacion(createClient(), id, decision, nota);
    setTrabajando(false);
    if (error) {
      setError(error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void decidir("aceptada")}
          disabled={trabajando}
          className="whitespace-nowrap rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Aceptar motivo
        </button>
        <button
          type="button"
          onClick={() => void decidir("rechazada")}
          disabled={trabajando}
          className="whitespace-nowrap rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          Rechazar
        </button>
      </div>
      {error && <span className="max-w-[14rem] text-right text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
