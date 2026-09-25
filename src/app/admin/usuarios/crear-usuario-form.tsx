"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AREAS_VALIDAS,
  AREA_LABELS,
  ROLES_VALIDOS,
  ROL_LABELS,
  requiereArea,
  requiereContratista,
  type RolValido,
  type AreaValida,
} from "@/lib/auth/roles";

export default function CrearUsuarioForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<RolValido>("usuario");
  const [area, setArea] = useState<AreaValida>("planeacion");
  const [contratista, setContratista] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const mostrarArea = requiereArea(rol);
  const mostrarContratista = requiereContratista(rol);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);

    const res = await fetch("/api/admin/usuarios/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        rol,
        area: mostrarArea ? area : null,
        contratista: mostrarContratista ? contratista : null,
      }),
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
    setContratista("");
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
          onChange={(e) => setRol(e.target.value as RolValido)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {ROLES_VALIDOS.map((r) => (
            <option key={r} value={r}>
              {ROL_LABELS[r]}
            </option>
          ))}
        </select>
        {mostrarArea && (
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as AreaValida)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {AREAS_VALIDAS.map((a) => (
              <option key={a} value={a}>
                {AREA_LABELS[a]}
              </option>
            ))}
          </select>
        )}
        {mostrarContratista && (
          <input
            required
            placeholder="Nombre del contratista"
            value={contratista}
            onChange={(e) => setContratista(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
        )}
      </div>
      {mostrarContratista && (
        <p className="text-xs text-gray-500">
          El maquilador solo entra a Estimaciones: captura sus recibos con este contratista y ve
          su estado (pendiente, revisado o pagado). No ve el precio sugerido ni el resto del ERP.
        </p>
      )}
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
