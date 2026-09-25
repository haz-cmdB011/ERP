import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import { buscarReciboPorFolio } from "@/lib/estimaciones/recibos-db";
import { buscarReciboElectrificacionPorFolio } from "@/lib/estimaciones/recibos-electrificacion-db";
import { esTipoCualquierRecibo } from "@/lib/estimaciones/revision-db";
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
    return recibo ? <RevisionRecibo tipo={tipo} recibo={recibo} /> : <NoEncontrado folio={folio} />;
  }
  const recibo = await buscarReciboPorFolio(supabase, folio, tipo);
  return recibo ? <RevisionRecibo tipo={tipo} recibo={recibo} /> : <NoEncontrado folio={folio} />;
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
