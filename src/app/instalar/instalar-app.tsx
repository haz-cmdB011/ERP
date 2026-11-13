"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AVISO_ERROR_AUTH, BOTON_AUTH, ENLACE_AUTH, Girando } from "@/components/auth-shell";
import {
  ESPERA_AVISO_MS,
  PAUSA_AL_INSTALAR_MS,
  instalaConBoton,
  plataformaDe,
  textoBoton,
  type EstadoInstalacion,
  type Plataforma,
} from "@/lib/ui/instalar-app";

// El evento que Chrome manda cuando la app se puede instalar: guardado, deja pedir la instalación con el botón.
interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Nada cambia mientras la pantalla está abierta: se lee una vez (en el servidor vale el valor de respaldo).
function suscribirNada() {
  return () => {};
}
function leerPlataforma(): Plataforma {
  return plataformaDe(navigator.userAgent, navigator.maxTouchPoints);
}
// Abierta como app instalada (sin barra del navegador).
function leerEnApp(): boolean {
  const iosApp = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosApp || window.matchMedia("(display-mode: standalone)").matches;
}

// Instalar la app y entrar: en Chrome un botón pide la instalación y, al aceptar, pasa al inicio de sesión
// (el de siempre); en iPhone se explica cómo agregarla desde "Compartir". Siempre se puede entrar sin instalar.
export default function InstalarApp() {
  const router = useRouter();
  const plataforma = useSyncExternalStore(suscribirNada, leerPlataforma, () => "otra" as Plataforma);
  const enApp = useSyncExternalStore(suscribirNada, leerEnApp, () => false);

  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [fase, setFase] = useState<"esperando" | "instalando" | "instalada" | "rechazada">("esperando");
  const [sinAviso, setSinAviso] = useState(false);
  const yaPaso = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Instalada (por el botón o desde el menú del navegador): se deja ver el aviso y se pasa al inicio de sesión.
  const alInstalar = useCallback(() => {
    if (yaPaso.current) return;
    yaPaso.current = true;
    setFase("instalada");
    temporizador.current = setTimeout(() => router.push("/login"), PAUSA_AL_INSTALAR_MS);
  }, [router]);

  // Si la persona toca "Registrarme" (o sale de la pantalla) antes de la pausa, no se la lleva al login después.
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    []
  );

  useEffect(() => {
    const alAviso = (e: Event) => {
      // Se guarda el aviso para pedir la instalación con nuestro botón y no con la barra del navegador.
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    window.addEventListener("beforeinstallprompt", alAviso);
    window.addEventListener("appinstalled", alInstalar);
    const espera = setTimeout(() => setSinAviso(true), ESPERA_AVISO_MS);
    return () => {
      window.removeEventListener("beforeinstallprompt", alAviso);
      window.removeEventListener("appinstalled", alInstalar);
      clearTimeout(espera);
    };
  }, [alInstalar]);

  async function instalar() {
    if (!evento) return;
    setFase("instalando");
    try {
      await evento.prompt();
      const { outcome } = await evento.userChoice;
      // El aviso solo se puede usar una vez: si se rechazó, el navegador manda otro cuando toque.
      setEvento(null);
      if (outcome === "accepted") alInstalar();
      else setFase("rechazada");
    } catch {
      setEvento(null);
      setFase("rechazada");
    }
  }

  const estado: EstadoInstalacion =
    fase === "instalando" || fase === "instalada" || fase === "rechazada" ? fase : evento ? "listo" : "preparando";

  // Ya abierta como app: no hay nada que instalar.
  if (enApp) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          Ya estás usando la app instalada.
        </p>
        <AvisoCuenta />
        <AccesosCuenta />
      </div>
    );
  }

  // iPhone y iPad: no hay botón, se agrega a mano.
  if (plataforma === "ios") {
    return (
      <div className="flex flex-col gap-5">
        <AvisoCuenta />
        <ol className="flex flex-col gap-3 text-sm text-slate-700">
          <Paso n={1}>
            Toca <strong>Compartir</strong> (el cuadro con la flecha hacia arriba).
          </Paso>
          <Paso n={2}>
            Elige <strong>Agregar a inicio</strong>.
          </Paso>
          <Paso n={3}>Abre la app desde tu pantalla de inicio e inicia sesión.</Paso>
        </ol>
        <AccesosCuenta />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {fase === "instalada" ? (
        <>
          <p role="status" className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm leading-relaxed text-brand-900">
            <strong>¡Listo! La app quedó instalada.</strong> Si es tu primera vez, regístrate primero. Si ya tienes cuenta,
            ingresa tus datos. En un momento te llevamos a iniciar sesión.
          </p>
          <AccesosCuenta />
        </>
      ) : (
        <>
          <AvisoCuenta />
          <button
            type="button"
            onClick={instalar}
            disabled={estado !== "listo" && estado !== "rechazada"}
            className={BOTON_AUTH}
            title={estado === "preparando" ? "El navegador está comprobando si se puede instalar" : undefined}
          >
            {(estado === "preparando" || estado === "instalando") && <Girando />}
            {textoBoton(estado)}
          </button>
          {fase === "rechazada" && (
            <p role="status" className={AVISO_ERROR_AUTH}>
              No se instaló. Puedes intentarlo otra vez o entrar sin instalar.
            </p>
          )}
          {/* Sin aviso del navegador (ya instalada, otro navegador…): se explica el camino manual. */}
          {sinAviso && !evento && fase !== "rechazada" && instalaConBoton(plataforma) && (
            <p className="text-sm leading-relaxed text-slate-600">
              ¿No se activa el botón? En Chrome toca el menú <strong>⋮</strong> y elige <strong>Instalar app</strong>{" "}
              (o <strong>Agregar a la pantalla principal</strong>). Si ya la instalaste, ábrela desde tu pantalla de inicio.
            </p>
          )}
          {sinAviso && !evento && !instalaConBoton(plataforma) && (
            <p className="text-sm leading-relaxed text-slate-600">
              Este navegador no permite instalarla desde aquí. Abre esta página en <strong>Chrome</strong> para
              instalarla, o entra sin instalar.
            </p>
          )}
        </>
      )}
      {fase !== "instalada" && (
        <Link href="/login" className={ENLACE_AUTH}>
          Entrar sin instalar
        </Link>
      )}
    </div>
  );
}

// Para entrar hace falta una cuenta: quien viene por primera vez se registra antes, y quien ya la tiene entra con sus datos.
function AvisoCuenta() {
  return (
    <p className="rounded-lg border border-slate-200 bg-white/70 px-4 py-3 text-sm leading-relaxed text-slate-700">
      <strong>Para entrar necesitas una cuenta.</strong> Si es tu primera vez,{" "}
      <Link href="/registro" className="font-medium text-brand-800 underline underline-offset-2">
        regístrate primero
      </Link>{" "}
      (después tu administrador te asigna tu área). Si ya tienes cuenta, inicia sesión con tus datos.
    </p>
  );
}

// Los dos caminos, a un toque: registrarse la primera vez o entrar con la cuenta de siempre.
function AccesosCuenta() {
  return (
    <div className="flex flex-col gap-2">
      <Link href="/registro" className={`${BOTON_AUTH} no-underline`}>
        Registrarme (primera vez)
      </Link>
      <Link
        href="/login"
        className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-base font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-brand-700"
      >
        Ya tengo cuenta: iniciar sesión
      </Link>
    </div>
  );
}

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-900"
      >
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
