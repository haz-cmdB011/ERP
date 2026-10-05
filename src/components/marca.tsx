// Marca de Mobiliarium para la interfaz. Usa el logotipo real recortado
// (scripts/generar-logo-ui.mjs lo genera desde public/branding): la variante
// "claro" tiene el texto aclarado para leerse sobre la barra oscura. No usa
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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/branding/mobiliarium-logo-ui${sobreOscuro ? "-claro" : ""}.png`}
      alt="Mobiliarium — creating lifestyle"
      width={239}
      height={47}
      className={`w-auto ${className}`}
    />
  );
}
