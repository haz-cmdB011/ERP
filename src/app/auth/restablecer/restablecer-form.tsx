"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { contrasenaFiltrada, MENSAJE_CONTRASENA_FILTRADA } from "@/lib/auth/contrasena-filtrada";
import { codigoValido, faltaSegundoPaso, normalizarCodigo } from "@/lib/seguridad/mfa";
import {
  AVISO_ERROR_AUTH,
  BOTON_AUTH,
  CAMPO_AUTH,
  ETIQUETA_AUTH,
  Girando,
} from "@/components/auth-shell";

// Formulario de contraseña nueva tras entrar por el enlace de recuperación. Quien tiene la
// verificación en dos pasos activada entra con la sesión a medias (aal1): antes de cambiar la
// contraseña se le pide su código, igual que al iniciar sesión.
export default function RestablecerForm() {
  const router = useRouter();
  const [pideCodigo, setPideCodigo] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const { data: nivel } = await createClient().auth.mfa.getAuthenticatorAssuranceLevel();
      if (vigente && faltaSegundoPaso(nivel)) setPideCodigo(true);
    })();
    return () => {
      vigente = false;
    };
  }, []);

  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!codigoValido(codigo)) {
      setError("El código tiene 6 dígitos.");
      return;
    }
    setGuardando(true);
    const supabase = createClient();
    const { data: factores, error: errorFactores } = await supabase.auth.mfa.listFactors();
    const factor = factores?.totp?.[0];
    if (errorFactores || !factor) {
      setGuardando(false);
      setError("No se encontró tu verificación en dos pasos. Pide un enlace nuevo desde el inicio de sesión.");
      return;
    }
    const { error: errorCodigo } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: normalizarCodigo(codigo),
    });
    setGuardando(false);
    if (errorCodigo) {
      setError("Código incorrecto o vencido. Revisa tu app e inténtalo de nuevo.");
      setCodigo("");
      return;
    }
    setPideCodigo(false);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setGuardando(true);
    if (await contrasenaFiltrada(password)) {
      setGuardando(false);
      setError(MENSAJE_CONTRASENA_FILTRADA);
      return;
    }
    const { error: errorGuardar } = await createClient().auth.updateUser({ password });
    if (errorGuardar) {
      setGuardando(false);
      setError(errorGuardar.message);
      return;
    }
    // Contraseña lista: a la pantalla de inicio de cada rol ("/" decide a dónde).
    router.push("/");
    router.refresh();
  }

  const mensajeError = error && (
    <p role="alert" className={AVISO_ERROR_AUTH}>
      {error}
    </p>
  );

  if (pideCodigo) {
    return (
      <form onSubmit={verificarCodigo} className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          Tu cuenta tiene verificación en dos pasos. Escribe el código de 6 dígitos de tu app de
          autenticación para continuar.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="codigo-restablecer" className={ETIQUETA_AUTH}>
            Código de verificación
          </label>
          <input
            id="codigo-restablecer"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            autoFocus
            placeholder="123 456"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className={`${CAMPO_AUTH} text-center font-mono text-xl tracking-[0.3em]`}
          />
        </div>
        <button type="submit" disabled={guardando} className={BOTON_AUTH}>
          {guardando && <Girando />}
          {guardando ? "Verificando..." : "Verificar"}
        </button>
        {mensajeError}
      </form>
    );
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password-nueva" className={ETIQUETA_AUTH}>
          Nueva contraseña
        </label>
        <input
          id="password-nueva"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Nueva contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={CAMPO_AUTH}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password-confirmar" className={ETIQUETA_AUTH}>
          Confirmar contraseña
        </label>
        <input
          id="password-confirmar"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Confirmar contraseña"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          className={CAMPO_AUTH}
        />
      </div>
      <button type="submit" disabled={guardando} className={BOTON_AUTH}>
        {guardando && <Girando />}
        {guardando ? "Guardando..." : "Guardar contraseña"}
      </button>
      {mensajeError}
    </form>
  );
}
