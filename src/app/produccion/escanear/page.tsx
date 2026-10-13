import type { Metadata } from "next";
import EscanerQr from "@/components/escaner-qr";

export const metadata: Metadata = { title: "Escanear QR" };

export default function EscanearPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Escanear QR</h1>
      </div>
      <EscanerQr area="produccion" />
    </main>
  );
}
