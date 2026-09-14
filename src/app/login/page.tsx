"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<"link" | "password">("password");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmitLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setEnviando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEnviado(true);
  }

  async function handleSubmitPassword(e: React.FormEvent) {
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

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">ERP — Iniciar sesión</h1>

      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => {
            setModo("password");
            setError(null);
            setEnviado(false);
          }}
          className={`rounded px-2 py-1 ${
            modo === "password" ? "bg-black text-white" : "border border-gray-300 text-gray-600"
          }`}
        >
          Contraseña
        </button>
        <button
          type="button"
          onClick={() => {
            setModo("link");
            setError(null);
            setEnviado(false);
          }}
          className={`rounded px-2 py-1 ${
            modo === "link" ? "bg-black text-white" : "border border-gray-300 text-gray-600"
          }`}
        >
          Enlace por correo
        </button>
      </div>

      {modo === "password" && (
        <form onSubmit={handleSubmitPassword} className="flex flex-col gap-3">
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
        </form>
      )}

      {modo === "link" &&
        (enviado ? (
          <p className="text-sm text-gray-600">
            Te enviamos un enlace de acceso a <strong>{email}</strong>. Revisa
            tu correo para continuar.
          </p>
        ) : (
          <form onSubmit={handleSubmitLink} className="flex flex-col gap-3">
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
              {enviando ? "Enviando..." : "Enviar enlace de acceso"}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        ))}
    </main>
  );
}
