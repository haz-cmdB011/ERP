import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Avisos from "@/components/avisos";
import { SCRIPT_TEMA } from "@/lib/tema";
import { SCRIPT_APARIENCIA } from "@/lib/apariencia";
import BarraProgreso from "@/components/barra-progreso";
import FondoMobiliario from "@/components/fondo-mobiliario";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    // Cada área pone su nombre ("Planeación · ERP Mobiliarium") y cada página
    // puede afinarlo (ej. el número de O.T. o de PM) para distinguir pestañas.
    template: "%s · ERP Mobiliarium",
    default: "ERP Mobiliarium",
  },
  description: "Sistema interno de Mobiliarium: Planeación, Producción, Calidad y Estimaciones.",
  // Aplicación interna: que los buscadores no la indexen.
  robots: { index: false, follow: false },
  // Al agregarla a la pantalla de inicio de iOS abre como app, sin la barra de
  // Safari (el manifest cubre Android; ver src/app/manifest.ts).
  appleWebApp: { capable: true, title: "ERP Mobiliarium", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

// viewportFit "cover" extiende la página bajo la muesca del iPhone (el
// contenido respeta las zonas seguras con env(safe-area-inset-*)). No se
// desactiva el zoom: quien lo necesite debe poder ampliar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c1a06",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: el script de abajo pone data-tema en <html>
    // antes de que React hidrate (el servidor no conoce la preferencia).
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica el tema elegido antes de pintar, para que no parpadee en
            claro al cargar una página en modo oscuro (o al revés). */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        {/* Igual con los colores y el vidrio elegidos en "Personalizar
            apariencia". */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_APARIENCIA }} />
      </head>
      <body className="min-h-full flex flex-col">
        <FondoMobiliario />
        <BarraProgreso />
        {children}
        <Avisos />
      </body>
    </html>
  );
}
