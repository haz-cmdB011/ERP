import type { Metadata } from "next";
import QRCode from "qrcode";
import Marca from "@/components/marca";
import { getBaseUrl } from "@/lib/site-url";
import BotonImprimir from "./boton-imprimir";

// La hoja que se imprime y se reparte: un QR que abre /instalar y los tres pasos. El QR lleva la dirección
// del sitio tal como se abrió esta hoja (o NEXT_PUBLIC_SITE_URL si está configurada): imprímela desde la
// dirección real del ERP, no desde localhost.
export const metadata: Metadata = {
  title: "Hoja para instalar la app",
  robots: { index: false, follow: false },
};

const PASOS: { n: number; titulo: string; lineas: string[] }[] = [
  { n: 1, titulo: "Escanea", lineas: ["el código con tu cámara"] },
  { n: 2, titulo: "Instala", lineas: ['Android: "Instalar app"', 'iPhone: Compartir → "Agregar a inicio"'] },
  { n: 3, titulo: "Entra", lineas: ["con tu correo y tu contraseña"] },
];

export default async function HojaInstalarPage() {
  const url = `${await getBaseUrl()}/instalar`;
  // PNG en el servidor: nítido al imprimir y sin script en la hoja.
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 720, errorCorrectionLevel: "M" });

  return (
    <main data-sin-acento className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center gap-8 bg-white px-6 py-10 text-slate-900 print:min-h-0 print:max-w-none print:gap-7 print:px-0 print:py-0">
      {/* Carta, con margen parejo: la hoja se imprime sola, sin menús. */}
      <style>{`@page { size: letter; margin: 14mm; }`}</style>

      <Marca className="h-14" />

      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Instala la app del ERP</h1>
        <p className="mt-2 text-base text-slate-600">Escanea con la cámara de tu celular</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="rounded-2xl border border-slate-300 p-4 print:p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={`Código QR que abre ${url}`}
            width={720}
            height={720}
            className="size-72 sm:size-80 print:size-[9.5cm]"
          />
        </div>
        <p className="break-all text-center font-mono text-xs text-slate-500">{url}</p>
      </div>

      <ol className="grid w-full grid-cols-1 gap-6 sm:grid-cols-3 print:grid-cols-3 print:gap-4">
        {PASOS.map((p) => (
          <li key={p.n} className="flex flex-col items-center gap-2 text-center">
            <span
              aria-hidden="true"
              className="inline-flex size-12 items-center justify-center rounded-full bg-slate-500 text-xl font-bold text-white print:bg-slate-600"
            >
              {p.n}
            </span>
            <span className="text-lg font-bold">{p.titulo}</span>
            <span className="flex flex-col text-sm leading-relaxed text-slate-600">
              {p.lineas.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </span>
          </li>
        ))}
      </ol>

      <p className="text-center text-sm text-slate-500">
        Si no puedes entrar, pide a tu administrador que te asigne tu área. ¿Dudas? Pregúntale a él.
      </p>

      <div className="print:hidden">
        <BotonImprimir />
      </div>
    </main>
  );
}
