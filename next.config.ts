import type { NextConfig } from "next";

// Cabeceras de seguridad del navegador en todas las respuestas.
//
// CSP: la app necesita 'unsafe-inline' en scripts y estilos (Next inyecta
// scripts en línea y hay un script de tema antes de pintar); aun así la
// política bloquea lo más peligroso: scripts, estilos, imágenes y conexiones
// que no sean del propio sitio o de Supabase, incrustar la app en otras páginas
// (frame-ancestors), plugins y cambiar el destino de formularios.
//
// Si alguna función legítima quedara bloqueada, definir CSP_SOLO_REPORTE=1 en
// Vercel la pasa a modo "solo reporte" (el navegador la anota en la consola
// pero no bloquea) sin tocar el código. Ver SEGURIDAD.md.
const esProduccion = process.env.NODE_ENV === "production";
const esDespliegueDeProduccion = process.env.VERCEL_ENV === "production" || (esProduccion && !process.env.VERCEL_ENV);

const supabase = "https://*.supabase.co";
const supabaseWs = "wss://*.supabase.co";
// En las vistas previas de Vercel se inyecta la barra de comentarios (vercel.live).
const vercelLive = esDespliegueDeProduccion ? "" : " https://vercel.live";

const csp = [
  "default-src 'self'",
  // 'unsafe-eval' solo en desarrollo (React/Next lo usan para depurar).
  `script-src 'self' 'unsafe-inline'${esProduccion ? "" : " 'unsafe-eval'"}${vercelLive}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}${vercelLive}`,
  "font-src 'self' data:",
  `connect-src 'self' blob: ${supabase} ${supabaseWs}${vercelLive}`,
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  `frame-src 'self' blob:${vercelLive}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(esProduccion ? ["upgrade-insecure-requests"] : []),
].join("; ");

const permisosBase = "microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()";

const cabecerasSeguridad = [
  {
    key: process.env.CSP_SOLO_REPORTE === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    value: csp,
  },
  // Que ninguna otra página pueda incrustar el ERP (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // El navegador no adivina el tipo de un archivo distinto al declarado.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // En general la app no usa cámara en vivo, micrófono ni ubicación (subir foto
  // desde la cámara pasa por el selector de archivos del sistema, no por esta
  // API). La única excepción es el escáner de QR de Producción, abajo.
  { key: "Permissions-Policy", value: `camera=(), ${permisosBase}` },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // No anunciar la tecnología del servidor.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: cabecerasSeguridad },
      // Escáner de QR (/produccion/escanear): la cámara en vivo solo se permite
      // aquí y solo para el propio sitio. Si dos reglas fijan la misma
      // cabecera gana la última, así que esta reemplaza a la de arriba.
      {
        source: "/produccion/escanear/:path*",
        headers: [{ key: "Permissions-Policy", value: `camera=(self), ${permisosBase}` }],
      },
      // Lo mismo para el escáner de Calidad.
      {
        source: "/calidad/escanear/:path*",
        headers: [{ key: "Permissions-Policy", value: `camera=(self), ${permisosBase}` }],
      },
    ];
  },
};

export default nextConfig;
