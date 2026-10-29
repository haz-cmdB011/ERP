import Link from "next/link";
import Marca from "./marca";

// Estilos compartidos por las pantallas de acceso (login, registro). 16 px de
// letra en los campos: con menos, iOS hace zoom al enfocarlos.
export const CAMPO_AUTH =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-900 shadow-sm placeholder:text-slate-500 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40";
export const ETIQUETA_AUTH = "text-sm font-medium text-slate-700";
export const BOTON_AUTH =
  "inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-base font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-400 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-50";
// Indicador que gira dentro del botón mientras se envía el formulario.
export function Girando() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="anim-giro mr-2 h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// min-h-11 (44 px): en el celular un enlace de una línea (20 px) es difícil de acertar con el dedo.
export const ENLACE_AUTH = "inline-flex min-h-11 items-center text-sm font-medium text-brand-800 underline-offset-2 hover:underline";
export const AVISO_ERROR_AUTH =
  "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700";

// Marco de las pantallas de acceso. En escritorio, panel de marca a la
// izquierda y formulario a la derecha; en celular y tableta, una franja con la
// marca arriba y el formulario debajo, a todo el ancho.
export default function AuthShell({
  titulo,
  descripcion,
  children,
  pie,
  sinAvisoPrivacidad,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
  pie?: React.ReactNode;
  // La pantalla ya trae su propio enlace al aviso (registro).
  sinAvisoPrivacidad?: boolean;
}) {
  return (
    <main data-sin-acento className="grid min-h-dvh grid-rows-[auto_1fr]">
      <header className="border-b border-nav-line bg-nav px-6 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-on-nav sm:px-10">
        <Marca sobreOscuro className="h-10 sm:h-11" />
      </header>

      <section className="pie-seguro flex items-center justify-center px-6 py-10 sm:px-10">
        {/* panel-auth: en el estilo "Vidrio" el formulario va en un panel de
            vidrio (vidrio.css); en el clásico, sin marco. */}
        <div className="panel-auth w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {titulo}
          </h1>
          {descripcion && (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {descripcion}
            </p>
          )}
          <div className="mt-7">
            {children}
          </div>
          {!sinAvisoPrivacidad && (
            <p className="mt-2 text-xs text-slate-600">
              <Link href="/privacidad" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-slate-900">
                Aviso de privacidad
              </Link>
            </p>
          )}
          {pie && (
            <div
              className="mt-6 flex flex-col gap-2 border-t border-slate-200 pt-5"
             
            >
              {pie}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
