"use client";

import Link from "next/link";
import { ERROR_GENERICO, fetchJson } from "@/lib/http/fetch-json";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Turnstile, { CLAVE_TURNSTILE } from "@/components/turnstile";
import { createClient } from "@/lib/supabase/client";
import PasswordStrengthMeter from "@/components/password-strength-meter";
import {
  AVISO_ERROR_AUTH,
  BOTON_AUTH,
  CAMPO_AUTH,
  ETIQUETA_AUTH,
  Girando,
} from "@/components/auth-shell";

export default function RegistroForm() {
  const router = useRouter();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Comprobación anti-robots (solo si hay clave del sitio): un token sirve una vez.
  const [tokenCaptcha, setTokenCaptcha] = useState<string | null>(null);
  const [reinicioCaptcha, setReinicioCaptcha] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (CLAVE_TURNSTILE && !tokenCaptcha) {
      setError("Espera a que termine la verificación de seguridad e inténtalo de nuevo.");
      return;
    }
    setEnviando(true);

    const r = await fetchJson("/api/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombres, apellidos, email, password, turnstileToken: tokenCaptcha }),
    });

    if (!r.ok) {
      setEnviando(false);
      setError(r.error ?? ERROR_GENERICO);
      setReinicioCaptcha((n) => n + 1);
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nombres" className={ETIQUETA_AUTH}>
            Nombre(s)
          </label>
          <input
            id="nombres"
            type="text"
            required
            autoComplete="given-name"
            value={nombres}
            onChange={(e) => setNombres(e.target.value)}
            className={CAMPO_AUTH}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="apellidos" className={ETIQUETA_AUTH}>
            Apellidos
          </label>
          <input
            id="apellidos"
            type="text"
            required
            autoComplete="family-name"
            value={apellidos}
            onChange={(e) => setApellidos(e.target.value)}
            className={CAMPO_AUTH}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={ETIQUETA_AUTH}>
          Correo electrónico
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="tu@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={CAMPO_AUTH}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={ETIQUETA_AUTH}>
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={CAMPO_AUTH}
        />
        <PasswordStrengthMeter password={password} />
      </div>
      <Turnstile alCambiar={setTokenCaptcha} reinicio={reinicioCaptcha} />
      <button type="submit" disabled={enviando} className={BOTON_AUTH}>
        {enviando && <Girando />}
        {enviando ? "Creando cuenta..." : "Crear cuenta"}
      </button>
      {error && (
        <p role="alert" className={AVISO_ERROR_AUTH}>
          {error}
        </p>
      )}
      <p className="text-xs leading-relaxed text-slate-600">
        Al crear tu cuenta aceptas el{" "}
        <Link href="/privacidad" className="font-medium text-brand-800 underline underline-offset-2">
          aviso de privacidad
        </Link>
        .
      </p>
    </form>
  );
}
