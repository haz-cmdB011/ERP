"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const AREAS = ["produccion", "calidad", "estimaciones", "finanzas"] as const;

export default function InvitarForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"admin" | "planeacion" | "area">("area");
  const [area, setArea] = useState<(typeof AREAS)[number]>("produccion");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);

    const res = await fetch("/api/admin/usuarios/invitar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, rol, area: rol === "area" ? area : null }),
    });
    const data = await res.json();

    setEnviando(false);
    if (!res.ok) {
      setMensaje({ tipo: "error", texto: data.error ?? "Error desconocido." });
      return;
    }
    setMensaje({ tipo: "ok", texto: `Invitación enviada a ${data.email}.` });
    setEmail("");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded border border-gray-200 p-4"
    >
      <h2 className="text-sm font-medium">Invitar nuevo usuario</h2>
      <input
        type="email"
        required
        placeholder="correo@empresa.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-3">
        <select
          value={rol}
          onChange={(e) => setRol(e.target.value as typeof rol)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="area">Área</option>
          <option value="planeacion">Planeación</option>
          <option value="admin">Admin</option>
        </select>
        {rol === "area" && (
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as typeof area)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>
      <button
        type="submit"
        disabled={enviando}
        className="w-fit rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {enviando ? "Invitando..." : "Invitar"}
      </button>
      {mensaje && (
        <p className={mensaje.tipo === "ok" ? "text-sm text-green-700" : "text-sm text-red-600"}>
          {mensaje.texto}
        </p>
      )}
    </form>
  );
}
