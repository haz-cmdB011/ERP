import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import { buscarReciboPorFolio } from "@/lib/estimaciones/recibos-db";
import { buscarReciboElectrificacionPorFolio } from "@/lib/estimaciones/recibos-electrificacion-db";
import { esTipoCualquierRecibo } from "@/lib/estimaciones/revision-db";
import { listarDiscrepanciasRecibo, type AreaRecibo } from "@/lib/estimaciones/discrepancias-db";
import DiscrepanciasRecibo from "../../../discrepancias-recibo";
import RevisionRecibo from "./revision-recibo";

// Revisión de un recibo: el personal de Estimaciones (desarrollador,
// administrador o trabajador) acepta o modifica el precio de cada renglón y,
// una vez revisado, lo marca como pagado. El maquilador no entra aquí.
export default async function RevisionReciboPage({
  params,
}: {
  params: Promise<{ tipo: string; folio: string }>;
}) {
  const { tipo, folio: folioParam } = await params;
  if (!esTipoCualquierRecibo(tipo)) notFound();
  const folio = decodeURIComponent(folioParam);

  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!puedeVerPrecioSugerido(perfil)) {
    redirect(perfil?.rol === "maquilador" ? "/estimaciones/mis-recibos" : "/estimaciones");
  }

  if (tipo === "electrificacion") {
    const recibo = await buscarReciboElectrificacionPorFolio(supabase, folio);
    if (!recibo) return <NoEncontrado folio={folio} />;
    const discrepancias = await avisoDiscrepancias(supabase, tipo, recibo.id, recibo.estado);
    return <RevisionRecibo tipo={tipo} recibo={recibo} discrepancias={discrepancias} />;
  }
  const recibo = await buscarReciboPorFolio(supabase, folio, tipo);
  if (!recibo) return <NoEncontrado folio={folio} />;
  const discrepancias = await avisoDiscrepancias(supabase, tipo, recibo.id, recibo.estado);
  return <RevisionRecibo tipo={tipo} recibo={recibo} discrepancias={discrepancias} />;
}

// Diferencias con el PM del recibo; mientras no esté pagado se avisa que
// bloquean el pago.
async function avisoDiscrepancias(
  supabase: Awaited<ReturnType<typeof createClient>>,
  area: AreaRecibo,
  reciboId: string | undefined,
  estado: string | undefined
) {
  if (!reciboId) return null;
  const discrepancias = await listarDiscrepanciasRecibo(supabase, area, reciboId);
  return <DiscrepanciasRecibo discrepancias={discrepancias} bloqueaPago={estado !== "pagado"} />;
}

function NoEncontrado({ folio }: { folio: string }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 p-6">
      <h1 className="text-lg font-semibold text-slate-900">Recibo no encontrado</h1>
      <p className="text-sm text-slate-500">
        El folio <span className="font-mono">{folio}</span> no está guardado.{" "}
        <Link href="/estimaciones/registro" className="text-indigo-600 hover:underline">
          Volver al registro
        </Link>
      </p>
    </main>
  );
}
