import type { Metadata } from "next";
import EscanerQr from "./escaner-qr";

export const metadata: Metadata = { title: "Escanear QR" };

export default function EscanearPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Escanear QR</h1>
        <p className="mt-1 text-sm text-slate-500">
          Escanea el QR de la hoja de viajero para registrar la entrega de ese mueble.
        </p>
      </div>
      <EscanerQr />
    </main>
  );
}
