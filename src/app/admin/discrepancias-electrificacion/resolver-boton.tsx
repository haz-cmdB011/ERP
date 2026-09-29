"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Marca una discrepancia como resuelta (solo desarrolladores; RLS y la RPC
// lo exigen de todas formas). Pide una nota corta de qué se hizo.
export default function ResolverBoton({ id }: { id: string }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolver() {
    const nota = window.prompt("¿Qué se hizo con esta discrepancia? (opcional)") ?? "";
    setTrabajando(true);
    setError(null);
    const { error } = await createClient().rpc("resolver_discrepancia_electrificacion", {
      p_id: id,
      p_nota: nota,
    });
    setTrabajando(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={() => void resolver()}
        disabled={trabajando}
        className="whitespace-nowrap rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {trabajando ? "Guardando…" : "Marcar resuelta"}
      </button>
      {error && <span className="max-w-[14rem] text-right text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
