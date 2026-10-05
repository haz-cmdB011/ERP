import Marca, { EstrellaMarca } from "./marca";

// Estilos compartidos por las pantallas de acceso (login, registro). 16 px de
// letra en los campos: con menos, iOS hace zoom al enfocarlos.
export const CAMPO_AUTH =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40";
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

export const ENLACE_AUTH = "text-sm font-medium text-brand-800 underline-offset-2 hover:underline";
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
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-rows-1">
      <header className="anim-aparecer bg-nav px-6 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-on-nav sm:px-10 lg:hidden">
        <Marca sobreOscuro className="h-11 sm:h-12" />
      </header>

      <aside className="relative hidden overflow-hidden bg-nav text-on-nav lg:flex lg:flex-col lg:justify-between lg:p-14">
        <EstrellaMarca className="anim-girar pointer-events-none absolute -bottom-24 -right-24 h-[30rem] w-[30rem] text-brand-500 opacity-[0.07]" />
        <span className="anim-aparecer relative block">
          <Marca sobreOscuro className="h-16 xl:h-20" />
        </span>
        <p className="anim-abrir-letras relative text-4xl font-semibold uppercase tracking-[0.2em] text-brand-500 xl:text-5xl">
          Sistema interno
        </p>
      </aside>

      <section className="pie-seguro flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="anim-aparecer text-2xl font-semibold tracking-tight text-slate-900" style={{ "--d": "100ms" } as React.CSSProperties}>
            {titulo}
          </h1>
          {descripcion && (
            <p className="anim-aparecer mt-2 text-sm leading-relaxed text-slate-600" style={{ "--d": "180ms" } as React.CSSProperties}>
              {descripcion}
            </p>
          )}
          <div className="anim-aparecer mt-7" style={{ "--d": "260ms" } as React.CSSProperties}>
            {children}
          </div>
          {pie && (
            <div
              className="anim-aparecer mt-6 flex flex-col gap-2 border-t border-slate-200 pt-5"
              style={{ "--d": "340ms" } as React.CSSProperties}
            >
              {pie}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
