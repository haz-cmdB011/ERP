"use client";

import ErrorLectura from "@/components/error-lectura";

// No se pudieron leer los datos de esta área: ver src/components/error-lectura.tsx.
export default function ErrorProduccion({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorLectura error={error} retry={retry} hrefInicio="/produccion" etiquetaInicio="Ir a Pedidos" />;
}
