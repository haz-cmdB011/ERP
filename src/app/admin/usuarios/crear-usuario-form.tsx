"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const AREAS = ["produccion", "calidad", "estimaciones", "finanzas"] as const;

export default function CrearUsuarioForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<
    | "desarrollador"
    | "admin_planeacion"
    | "admin_produccion"
    | "admin_calidad"
    | "admin_estimaciones"
    | "admin_finanzas"
    | "planeacion"
    | "area"
  >("area");
  const [area, setArea] = useState<(typeof AREAS)[number]>("produccion");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);

    const res = await fetch("/api/admin/usuarios/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rol, area: rol === "area" ? area : null }),
    });
    const data = await res.json();

    setEnviando(false);
    if (!res.ok) {
      setMensaje({ tipo: "error", texto: data.error ?? "Error desconocido." });
      return;
    }
    setMensaje({ tipo: "ok", texto: `Usuario ${data.email} creado.` });
    setEmail("");
    setPassword("");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded border border-gray-200 p-4"
    >
      <h2 className="text-sm font-medium">Crear nuevo usuario</h2>
      <p className="text-xs text-gray-500">
        Se crea directamente con email y contraseña — no se envía ningún
        correo. Los links de Supabase quedan reservados solo para que el
        usuario restablezca su contraseña por su cuenta.
      </p>
      <input
        type="email"
        required
        placeholder="correo@empresa.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        type="password"
        required
        minLength={8}
        placeholder="Contraseña inicial (mín. 8 caracteres)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
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
          <option value="admin_planeacion">Admin de Planeación</option>
          <option value="admin_produccion">Admin de Producción</option>
          <option value="admin_calidad">Admin de Calidad</option>
          <option value="admin_estimaciones">Admin de Estimaciones</option>
          <option value="admin_finanzas">Admin de Finanzas</option>
          <option value="desarrollador">Desarrollador</option>
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
        {enviando ? "Creando..." : "Crear usuario"}
      </button>
      {mensaje && (
        <p className={mensaje.tipo === "ok" ? "text-sm text-green-700" : "text-sm text-red-600"}>
          {mensaje.texto}
        </p>
      )}
    </form>
  );
}
