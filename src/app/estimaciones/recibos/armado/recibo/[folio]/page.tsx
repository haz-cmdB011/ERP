import { headers } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import { buscarReciboPorFolio } from "@/lib/estimaciones/recibos-db";
import ReciboFichaArmado from "../../recibo-ficha-armado";
import DescargarPdfButton from "../../../acabados/descargar-pdf-button";

// Ficha de seguimiento del recibo de Armado: a esto apunta el QR impreso en el PDF.
// El registro vive en Supabase (tablas recibos/renglones), así que este
// link funciona para cualquiera del área, no solo en el navegador donde se
// capturó — a diferencia del prototipo anterior en localStorage.
export default async function SeguimientoReciboArmadoPage({
  params,
}: {
  params: Promise<{ folio: string }>;
}) {
  const { folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);

  const supabase = await createClient();
  const esPersonal = puedeVerPrecioSugerido(await getPerfilActual(supabase));
  const recibo = await buscarReciboPorFolio(supabase, folio, "armado");

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
  const qrUrl = `${origin}/estimaciones/recibos/armado/recibo/${encodeURIComponent(folio)}`;

  if (!recibo) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-3 p-6">
        <h1 className="text-lg font-semibold text-slate-900">Recibo no encontrado</h1>
        <p className="text-sm text-slate-500">
          El folio <span className="font-mono">{folio}</span> no está guardado, o no tienes acceso al
          área de Estimaciones.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Seguimiento de recibo de Armado</h1>
        <div className="flex items-center gap-3">
          {esPersonal && (recibo.estado === "pendiente" || recibo.estado === "revisado") && (
            <Link
              href={`/estimaciones/revision/armado/${encodeURIComponent(recibo.folio)}`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {recibo.estado === "pendiente" ? "Revisar" : "Pagar"}
            </Link>
          )}
          <DescargarPdfButton nombreArchivo={`recibo-armado-${recibo.folio}.pdf`} />
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 shadow-sm">
        <ReciboFichaArmado recibo={recibo} qrUrl={qrUrl} mostrarInterno={esPersonal} />
      </div>
    </main>
  );
}
