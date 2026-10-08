"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/avisos";
import { createClient } from "@/lib/supabase/client";
import {
  alCambiarLaCola,
  descartarEnvio,
  enviosPendientesDe,
  guardarUsuario,
  hayConexion,
  olvidarUsuario,
  sincronizarAhora,
  usuarioActualId,
} from "@/lib/offline/cola-navegador";
import type { Envio } from "@/lib/offline/cola-envios";

// Cada cuánto se revisa la cola mientras haya algo por mandar (los envíos respetan su propia
// espera, así que revisar seguido no satura nada).
const REVISION_MS = 15_000;

function haceCuanto(desde: number, ahora: number): string {
  const minutos = Math.max(0, Math.round((ahora - desde) / 60_000));
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} d`;
}

// Indicador global (vive en el layout raíz): avisa cuando no hay conexión, cuántas capturas
// están guardadas en este aparato esperando red, las manda solas al volver la conexión y
// deja ver/descartar las que el servidor rechazó. Solo aparece con sesión iniciada.
export default function EstadoEnvios() {
  const router = useRouter();
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [enLinea, setEnLinea] = useState(true);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const usuarioRef = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    const uid = usuarioRef.current;
    const lista = uid ? await enviosPendientesDe(uid) : [];
    setEnvios(lista);
    // Sin nada que mostrar, el panel se cierra: si no, reaparecería solo la próxima vez que
    // haya algo en cola.
    if (lista.length === 0) setAbierto(false);
    setAhora(Date.now());
  }, []);

  const sincronizar = useCallback(
    async (forzar = false) => {
      const uid = usuarioRef.current;
      if (!uid || !hayConexion()) return;
      setEnviando(true);
      try {
        const resumen = await sincronizarAhora(uid, forzar);
        if (!resumen) return;
        for (const e of resumen.enviados) avisar(`Enviado: ${e.etiqueta}`);
        for (const e of resumen.rechazados) {
          avisar(`No se pudo registrar «${e.etiqueta}»: ${e.error ?? "el servidor lo rechazó"}`, "error");
        }
        if (resumen.enviados.length) router.refresh();
      } finally {
        setEnviando(false);
        await cargar();
      }
    },
    [cargar, router]
  );

  // Quién tiene la sesión (y cuándo cambia).
  useEffect(() => {
    let vivo = true;
    const fijar = (id: string | null) => {
      usuarioRef.current = id;
      if (vivo) setUsuarioId(id);
    };
    usuarioActualId().then((id) => {
      fijar(id);
      void cargar();
    });
    const { data } = createClient().auth.onAuthStateChange((evento, sesion) => {
      if (sesion?.user) {
        guardarUsuario(sesion.user.id);
        fijar(sesion.user.id);
      } else if (evento === "SIGNED_OUT") {
        olvidarUsuario();
        fijar(null);
      }
      void cargar();
    });
    return () => {
      vivo = false;
      data.subscription.unsubscribe();
    };
  }, [cargar]);

  // Conexión, regreso a la pantalla, cambios en la cola (también de otras pestañas) y revisión periódica.
  useEffect(() => {
    const alConectar = () => {
      setEnLinea(true);
      setTimeout(() => void sincronizar(), 1000);
    };
    const alDesconectar = () => setEnLinea(false);
    const alVolver = () => {
      if (document.visibilityState === "visible") void sincronizar();
    };
    queueMicrotask(() => setEnLinea(hayConexion()));
    window.addEventListener("online", alConectar);
    window.addEventListener("offline", alDesconectar);
    document.addEventListener("visibilitychange", alVolver);
    const soltar = alCambiarLaCola(() => void cargar());
    const temporizador = setInterval(() => void sincronizar(), REVISION_MS);
    void sincronizar();
    return () => {
      window.removeEventListener("online", alConectar);
      window.removeEventListener("offline", alDesconectar);
      document.removeEventListener("visibilitychange", alVolver);
      soltar();
      clearInterval(temporizador);
    };
  }, [cargar, sincronizar]);

  if (!usuarioId) return null;

  const pendientes = envios.filter((e) => e.estado === "pendiente");
  const rechazados = envios.filter((e) => e.estado === "rechazado");
  if (enLinea && envios.length === 0) return null;

  const hayProblema = rechazados.length > 0;
  const texto = hayProblema
    ? `${rechazados.length} sin registrar`
    : pendientes.length > 0
      ? `${pendientes.length} por enviar`
      : "Sin conexión";

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        role="status"
        aria-live="polite"
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] left-3 z-50 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium shadow-lg print:hidden sm:bottom-4 sm:left-4 ${
          hayProblema
            ? "border-rose-300 bg-rose-50 text-rose-800"
            : enLinea
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-slate-300 bg-white text-slate-800"
        }`}
      >
        <span aria-hidden="true">{hayProblema ? "⚠️" : enLinea ? "⏳" : "📡"}</span>
        <span>
          {!enLinea && (pendientes.length > 0 || hayProblema) ? `Sin conexión · ${texto}` : texto}
        </span>
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Envíos pendientes"
          className="fixed inset-0 z-[70] flex items-end justify-center bg-scrim/60 p-3 sm:items-center"
          onClick={() => setAbierto(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 text-slate-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Capturas guardadas en este aparato</h2>
                <p className="mt-1 text-xs text-slate-600">
                  {pendientes.length === 0
                    ? "Estas capturas llegaron al sistema pero no se pudieron registrar. Revisa el motivo y vuelve a capturarlas si hace falta."
                    : enLinea
                      ? "Se mandan solas. Si no pasa nada, puedes enviarlas ahora."
                      : "No hay conexión. Se mandarán solas cuando vuelva; no cierres sesión ni borres los datos del navegador."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {envios.length === 0 ? (
              <p className="mt-4 text-sm text-slate-700">No hay nada pendiente.</p>
            ) : (
              <ul className="mt-3 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
                {envios.map((e) => (
                  <li
                    key={e.id}
                    className={`rounded-lg border p-3 text-sm ${
                      e.estado === "rechazado" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <p className="font-medium">{e.etiqueta}</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Capturado {haceCuanto(e.creadoEn, ahora)}
                      {e.estado === "pendiente" && e.intentos > 0 ? ` · ${e.intentos} intento${e.intentos === 1 ? "" : "s"}` : ""}
                    </p>
                    {e.estado === "rechazado" ? (
                      <p className="mt-1 text-xs font-medium text-rose-800">No se registró: {e.error}</p>
                    ) : (
                      <p className="mt-1 text-xs text-amber-800">Esperando conexión…</p>
                    )}
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const seguro = window.confirm(
                            e.estado === "rechazado"
                              ? "¿Descartar esta captura? Tendrás que volver a registrarla."
                              : "Esta captura aún NO llegó al sistema. Si la descartas se pierde (foto incluida). ¿Descartar?"
                          );
                          if (seguro) void descartarEnvio(e.id);
                        }}
                        className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-rose-700 hover:bg-rose-100"
                      >
                        Descartar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {pendientes.length > 0 && (
              <button
                type="button"
                disabled={!enLinea || enviando}
                onClick={() => void sincronizar(true)}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-on-brand shadow-sm hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enviando ? "Enviando…" : enLinea ? "Enviar ahora" : "Sin conexión"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
