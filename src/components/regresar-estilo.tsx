// Estilo compartido de los controles para volver atrás: la píldora de
// "Regresar" bajo la barra (boton-regresar.tsx) y los enlaces de migas de pan
// sobre el título de una página (O.T. → Pedidos, etc.).
export const CLASE_REGRESAR =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white py-1.5 pl-2.5 pr-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-brand-600 hover:bg-brand-50 hover:text-brand-900 active:bg-brand-100";

export const CLASE_MIGA =
  "inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-brand-700 hover:underline";

export function FlechaRegresar({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
