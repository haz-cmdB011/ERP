"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<"login" | "recuperar">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setEnviando(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/planeacion");
    router.refresh();
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/planeacion/cuenta`,
    });

    setEnviando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEnviado(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">ERP — Iniciar sesión</h1>

      {modo === "login" ? (
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="tu@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={enviando}
            className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {enviando ? "Entrando..." : "Iniciar sesión"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => {
              setModo("recuperar");
              setError(null);
              setEnviado(false);
            }}
            className="text-left text-xs text-gray-500 underline"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          {enviado ? (
            <p className="text-sm text-gray-600">
              Te enviamos un link para restablecer tu contraseña a{" "}
              <strong>{email}</strong>. Revisa tu correo.
            </p>
          ) : (
            <form onSubmit={handleRecuperar} className="flex flex-col gap-3">
              <p className="text-xs text-gray-500">
                Te enviaremos un link para poner una contraseña nueva.
              </p>
              <input
                type="email"
                required
                placeholder="tu@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={enviando}
                className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {enviando ? "Enviando..." : "Enviar link para restablecer"}
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </form>
          )}
          <button
            type="button"
            onClick={() => {
              setModo("login");
              setError(null);
              setEnviado(false);
            }}
            className="text-left text-xs text-gray-500 underline"
          >
            ← Volver a iniciar sesión
          </button>
        </div>
      )}
    </main>
  );
}
