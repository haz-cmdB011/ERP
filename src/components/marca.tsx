// Marca de Mobiliarium para la interfaz. Usa el logotipo real vectorizado
// (scripts/generar-logo-ui.mjs lo genera desde public/branding, nítido a
// cualquier tamaño): la variante "claro" tiene el texto aclarado para leerse
// sobre la barra oscura. No usa
// next/image para que sea un <img> simple, igual que en las fichas de PDF.
// La estrella sola (EstrellaMarca) sirve de adorno y de ícono de la app.
export function EstrellaMarca({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M16 3v26M3 16h26M6.8 6.8l18.4 18.4M25.2 6.8 6.8 25.2" />
    </svg>
  );
}

// `className` fija el tamaño (altura); el ancho sale de la proporción del logo.
export default function Marca({
  sobreOscuro = false,
  className = "h-8 sm:h-12 xl:h-14",
}: {
  sobreOscuro?: boolean;
  className?: string;
}) {
  const img = (variante: string, extra = "") => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/branding/mobiliarium-logo-ui${variante}.svg`}
      alt="Mobiliarium — creating lifestyle"
      width={239}
      height={47}
      className={`w-auto ${className} ${extra}`}
    />
  );
  // Sobre la barra se pintan las dos versiones y el CSS elige la que contrasta
  // con el color de la barra (ver .logo-sobre-nav-* en globals.css).
  if (!sobreOscuro) return img("");
  return (
    <>
      {img("", "logo-sobre-nav-claro")}
      {img("-claro", "logo-sobre-nav-oscuro")}
    </>
  );
}
