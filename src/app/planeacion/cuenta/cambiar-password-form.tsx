"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function CambiarPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);

    if (password.length < 8) {
      setMensaje({ tipo: "error", texto: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }
    if (password !== confirmar) {
      setMensaje({ tipo: "error", texto: "Las contraseñas no coinciden." });
      return;
    }

    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setGuardando(false);

    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
      return;
    }
    setMensaje({ tipo: "ok", texto: "Contraseña actualizada." });
    setPassword("");
    setConfirmar("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Cambiar contraseña</h2>
      <input
        type="password"
        required
        placeholder="Nueva contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        type="password"
        required
        placeholder="Confirmar contraseña"
        value={confirmar}
        onChange={(e) => setConfirmar(e.target.value)}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={guardando}
        className="w-fit rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {guardando ? "Guardando..." : "Guardar contraseña"}
      </button>
      {mensaje && (
        <p className={mensaje.tipo === "ok" ? "text-sm text-green-700" : "text-sm text-red-600"}>
          {mensaje.texto}
        </p>
      )}
    </form>
  );
}
