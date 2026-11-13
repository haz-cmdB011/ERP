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

  // Instalada (por el botón o desde el menú del navegador): se deja ver el aviso y se pasa al inicio de sesión.
  const alInstalar = useCallback(() => {
    if (yaPaso.current) return;
    yaPaso.current = true;
    setFase("instalada");
    setTimeout(() => router.push("/login"), PAUSA_AL_INSTALAR_MS);
  }, [router]);

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
        <Link href="/login" className={`${BOTON_AUTH} no-underline`}>
          Iniciar sesión
        </Link>
      </div>
    );
  }

  // iPhone y iPad: no hay botón, se agrega a mano.
  if (plataforma === "ios") {
    return (
      <div className="flex flex-col gap-5">
        <ol className="flex flex-col gap-3 text-sm text-slate-700">
          <Paso n={1}>
            Toca <strong>Compartir</strong> (el cuadro con la flecha hacia arriba).
          </Paso>
          <Paso n={2}>
            Elige <strong>Agregar a inicio</strong>.
          </Paso>
          <Paso n={3}>Abre la app desde tu pantalla de inicio e inicia sesión.</Paso>
        </ol>
        <Link href="/login" className={`${BOTON_AUTH} no-underline`}>
          Ya la agregué: iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {fase === "instalada" ? (
        <p role="status" className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          ¡Listo! La app quedó instalada. Te llevamos a iniciar sesión…
        </p>
      ) : (
        <>
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
      <Link href="/login" className={ENLACE_AUTH}>
        Entrar sin instalar
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
