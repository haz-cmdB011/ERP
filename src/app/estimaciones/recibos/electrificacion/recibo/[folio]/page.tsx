import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { buscarReciboElectrificacionPorFolio } from "@/lib/estimaciones/recibos-electrificacion-db";
import ReciboFichaElectrificacion from "../../recibo-ficha-electrificacion";
import DescargarPdfButton from "../../../acabados/descargar-pdf-button";

// Ficha de seguimiento del recibo de Electrificación: a esto apunta el QR
// impreso en el PDF.
export default async function SeguimientoReciboElectrificacionPage({
  params,
}: {
  params: Promise<{ folio: string }>;
}) {
  const { folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);

  const supabase = await createClient();
  const recibo = await buscarReciboElectrificacionPorFolio(supabase, folio);

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
  const qrUrl = `${origin}/estimaciones/recibos/electrificacion/recibo/${encodeURIComponent(folio)}`;

  if (!recibo) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-3 p-6">
        <h1 className="text-lg font-semibold text-slate-900">Recibo no encontrado</h1>
        <p className="text-sm text-slate-500">
          El folio <span className="font-mono">{folio}</span> de Electrificación no está guardado, o
          no tienes acceso al área de Estimaciones.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Seguimiento de recibo</h1>
        <DescargarPdfButton nombreArchivo={`recibo-electrificacion-${recibo.folio}.pdf`} />
      </div>
      <div className="rounded-xl border border-slate-200 shadow-sm">
        <ReciboFichaElectrificacion recibo={recibo} qrUrl={qrUrl} />
      </div>
    </main>
  );
}
