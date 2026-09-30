import { headers } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EliminarReciboDefinitivoBoton from "../../../../eliminar-recibo-definitivo-boton";
import { getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import {
  buscarReciboElectrificacionPorFolio,
  listarDiscrepanciasRecibo,
} from "@/lib/estimaciones/recibos-electrificacion-db";
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
  const perfil = await getPerfilActual(supabase);
  const esPersonal = puedeVerPrecioSugerido(perfil);
  const esDesarrollador = perfil?.rol === "desarrollador";
  const recibo = await buscarReciboElectrificacionPorFolio(supabase, folio);

  const discrepancias = recibo?.id ? await listarDiscrepanciasRecibo(supabase, recibo.id) : [];

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
        <div className="flex items-center gap-3">
          {esPersonal && (recibo.estado === "pendiente" || recibo.estado === "revisado") && (
            <Link
              href={`/estimaciones/revision/electrificacion/${encodeURIComponent(recibo.folio)}`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {recibo.estado === "pendiente" ? "Revisar" : "Pagar"}
            </Link>
          )}
          {esDesarrollador && recibo.id && (
            <EliminarReciboDefinitivoBoton
              tipo="electrificacion"
              reciboId={recibo.id}
              folio={recibo.folio}
            />
          )}
          <DescargarPdfButton nombreArchivo={`recibo-electrificacion-${recibo.folio}.pdf`} />
        </div>
      </div>
      {discrepancias.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 text-sm">
          <h2 className="font-semibold text-slate-900">Cantidades que superan lo declarado en el PM</h2>
          {discrepancias.map((d) => (
            <div
              key={d.id}
              className={`rounded-lg px-3 py-2 ring-1 ${
                d.estado === "rechazada"
                  ? "bg-rose-50 text-rose-900 ring-rose-200"
                  : d.estado === "aceptada"
                    ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
                    : "bg-amber-50 text-amber-900 ring-amber-200"
              }`}
            >
              <p className="font-medium">
                <span className="font-mono">{d.modelo}</span> ·{" "}
                {d.estado === "rechazada"
                  ? "Motivo NO aceptado"
                  : d.estado === "aceptada"
                    ? "Motivo aceptado"
                    : "Pendiente de revisión del administrador"}
              </p>
              <p className="text-xs">
                {d.cantidadPm == null
                  ? "El modelo no está en el PM de la OT"
                  : `PM declara ${d.cantidadPm} pz · acumulado ${d.cantidadAcumulada ?? "—"} pz`}
              </p>
              <p className="mt-1 text-xs">Motivo del maquilador: {d.motivo}</p>
              {d.notaResolucion && (
                <p className="mt-1 text-xs">Respuesta del administrador: {d.notaResolucion}</p>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="rounded-xl border border-slate-200 shadow-sm">
        <ReciboFichaElectrificacion recibo={recibo} qrUrl={qrUrl} mostrarInterno={esPersonal} />
      </div>
    </main>
  );
}
