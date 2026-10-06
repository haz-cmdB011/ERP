"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { codigoValido, faltaSegundoPaso, normalizarCodigo } from "@/lib/seguridad/mfa";
import AuthShell, {
  AVISO_ERROR_AUTH,
  BOTON_AUTH,
  CAMPO_AUTH,
  ENLACE_AUTH,
  ETIQUETA_AUTH,
  Girando,
} from "@/components/auth-shell";

// Clave donde se guarda el correo si la persona pidió recordar sus datos.
const CLAVE_CORREO = "erp-login-correo";

// Pide al navegador que guarde correo y contraseña en su gestor de contraseñas
// (Chrome, Edge y Android). La app nunca guarda la contraseña por su cuenta:
// quien la custodia es el navegador, cifrada. Si no hay soporte, el
// autocompletado normal del navegador sigue funcionando.
async function guardarEnGestorDelNavegador(correo: string, contrasena: string) {
  try {
    const Credencial = (
      window as unknown as {
        PasswordCredential?: new (datos: { id: string; password: string; name?: string }) => Credential;
      }
    ).PasswordCredential;
    if (Credencial && navigator.credentials?.store) {
      await navigator.credentials.store(new Credencial({ id: correo, password: contrasena, name: correo }));
    }
  } catch {
    // Sin permiso o sin soporte: no es un error de inicio de sesión.
  }
}

function suscribirNada() {
  return () => {};
}

function leerCorreoGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_CORREO);
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<"login" | "recuperar" | "mfa">("login");

  // Correo recordado de la vez anterior (null en el servidor y si no hay). Lo
  // escrito en esta sesión manda sobre lo recordado.
  const correoGuardado = useSyncExternalStore(suscribirNada, leerCorreoGuardado, () => null);
  const [correoEscrito, setEmail] = useState<string | null>(null);
  const email = correoEscrito ?? correoGuardado ?? "";
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [recordarElegido, setRecordar] = useState<boolean | null>(null);
  const recordar = recordarElegido ?? correoGuardado !== null;

  const [codigo, setCodigo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Volver al login con una sesión que aún no pasó el segundo paso (p. ej. el
  // servidor lo mandó aquí con ?mfa=1): se pide el código directamente.
  useEffect(() => {
    let vigente = true;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (vigente && faltaSegundoPaso(nivel)) setModo("mfa");
    })();
    return () => {
      vigente = false;
    };
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setEnviando(false);
      setError(error.message);
      return;
    }
    // Si tiene la verificación en dos pasos activada, falta pedir el código antes
    // de entrar (la sesión todavía no sirve para usar la app).
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setEnviando(false);
    if (faltaSegundoPaso(nivel)) {
      setModo("mfa");
      return;
    }
    try {
      if (recordar) localStorage.setItem(CLAVE_CORREO, email);
      else localStorage.removeItem(CLAVE_CORREO);
    } catch {
      // Sin localStorage no se puede recordar el correo; el acceso sigue.
    }
    if (recordar) await guardarEnGestorDelNavegador(email, password);
    router.push("/planeacion");
    router.refresh();
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!codigoValido(codigo)) {
      setError("El código tiene 6 dígitos.");
      return;
    }
    setEnviando(true);
    const supabase = createClient();
    const { data: factores, error: errorFactores } = await supabase.auth.mfa.listFactors();
    const factor = factores?.totp?.[0];
    if (errorFactores || !factor) {
      setEnviando(false);
      setError("No se encontró tu verificación en dos pasos. Inicia sesión de nuevo.");
      return;
    }
    const { error: errorCodigo } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: normalizarCodigo(codigo),
    });
    setEnviando(false);
    if (errorCodigo) {
      setError("Código incorrecto o vencido. Revisa tu app e inténtalo de nuevo.");
      setCodigo("");
      return;
    }
    try {
      if (recordar) localStorage.setItem(CLAVE_CORREO, email);
    } catch {
      // Sin localStorage no se puede recordar el correo; el acceso sigue.
    }
    router.push("/planeacion");
    router.refresh();
  }

  async function cancelarMfa() {
    await createClient().auth.signOut();
    setCodigo("");
    setPassword("");
    setError(null);
    setModo("login");
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

  const mensajeError = error && (
    <p role="alert" className={AVISO_ERROR_AUTH}>
      {error}
    </p>
  );

  if (modo === "mfa") {
    return (
      <AuthShell
        titulo="Verificación en dos pasos"
        descripcion="Escribe el código de 6 dígitos que muestra tu app de autenticación."
        pie={
          <button type="button" onClick={cancelarMfa} className={`${ENLACE_AUTH} w-fit text-left`}>
            ← Cancelar e iniciar sesión de nuevo
          </button>
        }
      >
        <form onSubmit={handleMfa} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="codigo-mfa" className={ETIQUETA_AUTH}>
              Código de verificación
            </label>
            <input
              id="codigo-mfa"
              name="codigo"
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
          <button type="submit" disabled={enviando} className={BOTON_AUTH}>
            {enviando && <Girando />}
            {enviando ? "Verificando..." : "Verificar"}
          </button>
          {mensajeError}
        </form>
      </AuthShell>
    );
  }

  if (modo === "recuperar") {
    return (
      <AuthShell
        titulo="Restablecer contraseña"
        descripcion="Te enviaremos un link para poner una contraseña nueva."
        pie={
          <button
            type="button"
            onClick={() => {
              setModo("login");
              setError(null);
              setEnviado(false);
            }}
            className={`${ENLACE_AUTH} w-fit text-left`}
          >
            ← Volver a iniciar sesión
          </button>
        }
      >
        {enviado ? (
          <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            Te enviamos un link para restablecer tu contraseña a <strong>{email}</strong>. Revisa tu
            correo.
          </p>
        ) : (
          <form onSubmit={handleRecuperar} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email-recuperar" className={ETIQUETA_AUTH}>
                Correo electrónico
              </label>
              <input
                id="email-recuperar"
                type="email"
                required
                autoComplete="email"
                placeholder="tu@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={CAMPO_AUTH}
              />
            </div>
            <button type="submit" disabled={enviando} className={BOTON_AUTH}>
              {enviando && <Girando />}
              {enviando ? "Enviando..." : "Enviar link para restablecer"}
            </button>
            {mensajeError}
          </form>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      titulo="Iniciar sesión"
      descripcion="Entra con tu cuenta para continuar."
      pie={
        <>
          <button
            type="button"
            onClick={() => {
              setModo("recuperar");
              setError(null);
              setEnviado(false);
            }}
            className={`${ENLACE_AUTH} w-fit text-left`}
          >
            ¿Olvidaste tu contraseña?
          </button>
          <Link href="/registro" className={`${ENLACE_AUTH} w-fit`}>
            ¿No tienes cuenta? Regístrate
          </Link>
        </>
      }
    >
      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className={ETIQUETA_AUTH}>
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
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
          <div className="relative">
            <input
              id="password"
              name="password"
              type={verPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${CAMPO_AUTH} pr-24`}
            />
            <button
              type="button"
              onClick={() => setVerPassword((v) => !v)}
              aria-pressed={verPassword}
              className="absolute inset-y-0 right-0 rounded-r-lg px-3.5 text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              {verPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={recordar}
            onChange={(e) => setRecordar(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
          />
          <span>
            Recordar mis datos
            <span className="block text-xs text-slate-500">
              Guarda tu correo en este equipo; la contraseña la guarda tu navegador.
            </span>
          </span>
        </label>
        <button type="submit" disabled={enviando} className={BOTON_AUTH}>
          {enviando && <Girando />}
          {enviando ? "Entrando..." : "Iniciar sesión"}
        </button>
        {mensajeError}
      </form>
    </AuthShell>
  );
}
