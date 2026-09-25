// Iconos de trazo para los estados en texto plano (Aprobado, Pendiente...) y
// las acciones de aprobación. Mismo estilo de trazo que el resto de la app.
export function Icono({
  className = "h-4 w-4",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconoCheck = ({ className }: { className?: string }) => (
  <Icono className={className}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icono>
);

export const IconoX = ({ className }: { className?: string }) => (
  <Icono className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icono>
);

export const IconoReloj = ({ className }: { className?: string }) => (
  <Icono className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icono>
);

export const IconoCancelado = ({ className }: { className?: string }) => (
  <Icono className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </Icono>
);
