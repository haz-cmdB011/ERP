"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

// Widget de Cloudflare Turnstile (anti-robots). Solo se muestra si hay clave del
// sitio (NEXT_PUBLIC_TURNSTILE_SITE_KEY); el servidor lo verifica en /api/registro.
// `reinicio` cambia cada vez que hay que pedir un token nuevo (un token sirve una
// sola vez): el formulario lo incrementa tras un intento fallido.

interface ApiTurnstile {
  render: (
    contenedor: HTMLElement,
    opciones: {
      sitekey: string;
      theme: "auto";
      language: "es";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    }
  ) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: ApiTurnstile;
  }
}

export const CLAVE_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

export default function Turnstile({
  alCambiar,
  reinicio,
}: {
  alCambiar: (token: string | null) => void;
  reinicio: number;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const idWidget = useRef<string | null>(null);

  const dibujar = useCallback(() => {
    if (!CLAVE_TURNSTILE || !contenedor.current || !window.turnstile || idWidget.current) return;
    idWidget.current = window.turnstile.render(contenedor.current, {
      sitekey: CLAVE_TURNSTILE,
      theme: "auto",
      language: "es",
      callback: (token) => alCambiar(token),
      "expired-callback": () => alCambiar(null),
      "error-callback": () => alCambiar(null),
    });
  }, [alCambiar]);

  // Si el script ya estaba cargado (volver a la pantalla), se dibuja de inmediato.
  useEffect(() => {
    dibujar();
    return () => {
      if (idWidget.current && window.turnstile) window.turnstile.remove(idWidget.current);
      idWidget.current = null;
    };
  }, [dibujar]);

  useEffect(() => {
    if (reinicio > 0 && idWidget.current && window.turnstile) {
      alCambiar(null);
      window.turnstile.reset(idWidget.current);
    }
  }, [reinicio, alCambiar]);

  if (!CLAVE_TURNSTILE) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={dibujar}
      />
      <div ref={contenedor} className="min-h-[65px]" />
    </>
  );
}
