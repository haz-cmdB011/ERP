import type { MetadataRoute } from "next";

// Permite "Agregar a pantalla de inicio" en Android y iOS: la app abre a
// pantalla completa, con el verde de la marca en la barra del sistema.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ERP Mobiliarium",
    short_name: "ERP",
    description: "Sistema interno de Mobiliarium: Planeación, Producción, Calidad y Estimaciones.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0c1a06",
    theme_color: "#0c1a06",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
