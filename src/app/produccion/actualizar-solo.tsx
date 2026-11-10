"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Mantiene al día el inicio sin recargar a mano: vuelve a leer los datos cada minuto mientras la pestaña se ve
// y al regresar a ella si pasó más de medio minuto. No actualiza sin conexión ni mientras hay una ventana abierta
// (una entrega a medias, la vista previa), para no estorbar a quien está capturando.
const CADA_MS = 60_000;
const AL_VOLVER_MS = 30_000;

export default function ActualizarSolo({ generadoEn }: { generadoEn: string }) {
  const router = useRouter();
  const ultimo = useRef(0);

  // Cada vez que el servidor manda datos nuevos se reinicia la cuenta.
  useEffect(() => {
    ultimo.current = Date.now();
  }, [generadoEn]);

  useEffect(() => {
    function refrescar(minimoMs: number) {
      if (document.visibilityState !== "visible") return;
      if (navigator.onLine === false) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (Date.now() - ultimo.current < minimoMs) return;
      ultimo.current = Date.now();
      router.refresh();
    }
    const cadaMinuto = setInterval(() => refrescar(CADA_MS - 1000), CADA_MS);
    const alVolver = () => refrescar(AL_VOLVER_MS);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      clearInterval(cadaMinuto);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [router]);

  const hora = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(generadoEn));

  return (
    <p className="text-xs tabular-nums text-slate-500" title="Se actualiza sola cada minuto">
      Actualizado {hora}
    </p>
  );
}
