// Flecha de los desplegables: apunta a la derecha y gira 90° al abrirse, con
// una transición suave. Sustituye a los caracteres ▸ / ▾, que cambiaban de golpe.
export default function Chevron({
  abierto,
  className = "h-4 w-4",
}: {
  abierto: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} shrink-0 transition-transform duration-300 ease-out ${
        abierto ? "rotate-90" : ""
      }`}
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
