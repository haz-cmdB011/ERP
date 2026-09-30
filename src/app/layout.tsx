import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Avisos from "@/components/avisos";

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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Avisos />
      </body>
    </html>
  );
}
