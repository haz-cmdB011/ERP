"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PasswordStrengthMeter from "@/components/password-strength-meter";

export default function RegistroForm() {
  const router = useRouter();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const res = await fetch("/api/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombres, apellidos, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setEnviando(false);
      setError(data.error ?? "Error desconocido.");
      return;
    }

    // La cuenta ya se creó confirmada del lado del servidor; falta iniciar
    // sesión para que el navegador tenga las cookies de la sesión.
    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });

    setEnviando(false);
    if (loginError) {
      setError(
        "Tu cuenta se creó, pero no se pudo iniciar sesión automáticamente. Intenta iniciar sesión manualmente."
      );
      return;
    }

    router.push("/planeacion");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        required
        placeholder="Nombre(s)"
        value={nombres}
        onChange={(e) => setNombres(e.target.value)}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        type="text"
        required
        placeholder="Apellidos"
        value={apellidos}
        onChange={(e) => setApellidos(e.target.value)}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        type="email"
        required
        placeholder="tu@empresa.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex flex-col gap-1.5">
        <input
          type="password"
          required
          minLength={8}
          placeholder="Contraseña (mín. 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <PasswordStrengthMeter password={password} />
      </div>
      <button
        type="submit"
        disabled={enviando}
        className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {enviando ? "Creando cuenta..." : "Crear cuenta"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
