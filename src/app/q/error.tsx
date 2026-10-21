"use client";

import ErrorLectura from "@/components/error-lectura";

// No se pudieron leer los datos del mueble escaneado: ver src/components/error-lectura.tsx.
export default function ErrorQr({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorLectura error={error} retry={retry} hrefInicio="/planeacion" etiquetaInicio="Ir al inicio" />;
}
