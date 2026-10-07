"use client";

import { useEffect, useState } from "react";
import { avisar } from "@/components/avisos";
import { createClient } from "@/lib/supabase/client";
import { codigoValido, normalizarCodigo } from "@/lib/seguridad/mfa";

interface Alta {
  factorId: string;
  qr: string;
  secreto: string;
}

// Verificación en dos pasos con una app de autenticación (Google Authenticator,
// Microsoft Authenticator, Authy...). Activarla es opcional pero recomendable,
// sobre todo para cuentas de desarrollador: aunque alguien robe la contraseña,
// no puede entrar sin el código que cambia cada 30 segundos en el teléfono.
export default function MfaForm() {
  const [cargando, setCargando] = useState(true);
  const [factorActivo, setFactorActivo] = useState<string | null>(null);
  const [alta, setAlta] = useState<Alta | null>(null);
  const [codigo, setCodigo] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leerEstado() {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorActivo(data?.totp?.[0]?.id ?? null);
    setCargando(false);
  }

  useEffect(() => {
    // La lectura es asíncrona: el estado se fija al responder, no al montar.
    let vigente = true;
    createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => {
        if (!vigente) return;
        setFactorActivo(data?.totp?.[0]?.id ?? null);
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, []);

  async function empezarAlta() {
    setError(null);
    setTrabajando(true);
    const supabase = createClient();
    // Si quedó un alta a medias de un intento anterior, se limpia primero.
    const { data: existentes } = await supabase.auth.mfa.listFactors();
    for (const f of existentes?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: errorAlta } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `ERP ${new Date().toLocaleDateString("es-MX")}`,
    });
    setTrabajando(false);
    if (errorAlta || !data) {
      setError("No se pudo iniciar la activación. Inténtalo de nuevo.");
      return;
    }
    setAlta({ factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
    setCodigo("");
  }

  async function confirmarAlta(e: React.FormEvent) {
    e.preventDefault();
    if (!alta) return;
    setError(null);
    if (!codigoValido(codigo)) {
      setError("El código tiene 6 dígitos.");
      return;
    }
    setTrabajando(true);
    const supabase = createClient();
    const { error: errorCodigo } = await supabase.auth.mfa.challengeAndVerify({
      factorId: alta.factorId,
      code: normalizarCodigo(codigo),
    });
    setTrabajando(false);
    if (errorCodigo) {
      setError("Código incorrecto. Revisa que la hora de tu teléfono sea la automática e inténtalo de nuevo.");
      setCodigo("");
      return;
    }
    setAlta(null);
    setCodigo("");
    avisar("Verificación en dos pasos activada");
    await leerEstado();
  }

  async function cancelarAlta() {
    if (alta) await createClient().auth.mfa.unenroll({ factorId: alta.factorId });
    setAlta(null);
    setCodigo("");
    setError(null);
  }

  async function desactivar() {
    if (!factorActivo) return;
    setError(null);
    setTrabajando(true);
    const { error: errorBaja } = await createClient().auth.mfa.unenroll({ factorId: factorActivo });
    setTrabajando(false);
    setConfirmandoBaja(false);
    if (errorBaja) {
      setError("No se pudo desactivar. Cierra sesión, vuelve a entrar con tu código e inténtalo de nuevo.");
      return;
    }
    avisar("Verificación en dos pasos desactivada", "info");
    await leerEstado();
  }

  const boton =
    "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  if (cargando) {
    return <p className="text-sm text-slate-500">Revisando el estado…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {alta ? (
        <form onSubmit={confirmarAlta} className="flex flex-col gap-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>Abre tu app de autenticación y agrega una cuenta nueva.</li>
            <li>Escanea este código QR (o escribe la clave a mano).</li>
            <li>Escribe aquí el código de 6 dígitos que te muestre.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR en data URI generado por Supabase */}
            <img src={alta.qr} alt="Código QR para tu app de autenticación" className="h-40 w-40 rounded-lg border border-slate-200 bg-white p-2" />
            <div className="min-w-0 text-xs text-slate-500">
              <p>¿No puedes escanear? Escribe esta clave:</p>
              <p className="mt-1 break-all rounded bg-slate-100 px-2 py-1 font-mono text-slate-800">{alta.secreto}</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="codigo-alta" className="text-sm font-medium text-slate-700">
              Código de 6 dígitos
            </label>
            <input
              id="codigo-alta"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="123 456"
              className="h-11 w-full max-w-48 rounded-lg border border-slate-300 bg-white px-3.5 text-center font-mono text-lg tracking-[0.25em] text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={trabajando} className={`${boton} bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}>
              {trabajando ? "Verificando..." : "Activar"}
            </button>
            <button type="button" onClick={cancelarAlta} disabled={trabajando} className={`${boton} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
              Cancelar
            </button>
          </div>
        </form>
      ) : factorActivo ? (
        <>
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
            <strong className="font-semibold text-slate-900">Activada.</strong> Al iniciar sesión se te pedirá el código de tu app.
          </p>
          {confirmandoBaja ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <span>¿Desactivar la verificación en dos pasos? Tu cuenta quedará protegida solo por la contraseña.</span>
              <button type="button" onClick={desactivar} disabled={trabajando} className={`${boton} bg-rose-600 text-white hover:bg-rose-500`}>
                {trabajando ? "Desactivando..." : "Sí, desactivar"}
              </button>
              <button type="button" onClick={() => setConfirmandoBaja(false)} className={`${boton} border border-slate-300 text-slate-700 hover:bg-white`}>
                No
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmandoBaja(true)} className={`${boton} w-fit border border-slate-300 text-slate-700 hover:bg-slate-50`}>
              Desactivar
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Además de tu contraseña, se pide un código de 6 dígitos de una app en tu teléfono. Recomendado,
            sobre todo para desarrolladores.
          </p>
          <button type="button" onClick={empezarAlta} disabled={trabajando} className={`${boton} w-fit bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}>
            {trabajando ? "Preparando..." : "Activar verificación en dos pasos"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
