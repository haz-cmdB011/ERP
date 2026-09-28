import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  esMaquilador,
  getPerfilActual,
  puedeCapturarTipo,
  puedeVerPrecioSugerido,
} from "@/lib/auth/get-perfil";
import { esTipoCualquierRecibo } from "@/lib/estimaciones/revision-db";
import { buscarReciboPorFolio } from "@/lib/estimaciones/recibos-db";
import { buscarReciboElectrificacionPorFolio } from "@/lib/estimaciones/recibos-electrificacion-db";
import CapturaAcabados from "@/app/estimaciones/recibos/acabados/captura-acabados";
import CapturaArmado from "@/app/estimaciones/recibos/armado/captura-armado";
import CapturaElectrificacion from "@/app/estimaciones/recibos/electrificacion/captura-electrificacion";

// Modificar un recibo propio, pendiente y sin renglones revisados (mismo
// candado que Cancelar): RLS de buscarReciboPorFolio ya limita al maquilador
// a solo sus recibos, así que si no es suyo simplemente no lo encuentra.
export default async function ModificarReciboPage({
  params,
}: {
  params: Promise<{ tipo: string; folio: string }>;
}) {
  const { tipo, folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);
  if (!esTipoCualquierRecibo(tipo)) notFound();

  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!esMaquilador(perfil)) {
    redirect("/estimaciones/registro");
  }
  // Solo recibos de su(s) área(s) de maquila: si ya no la tiene asignada, la
  // base rechazaría los renglones nuevos.
  if (!puedeCapturarTipo(perfil, tipo)) {
    redirect("/estimaciones/mis-recibos");
  }
  const puedeVerSugerido = puedeVerPrecioSugerido(perfil);
  const contratistaFijo = perfil?.contratista ?? null;

  if (tipo === "electrificacion") {
    const recibo = await buscarReciboElectrificacionPorFolio(supabase, folio);
    const sinRevisar = recibo?.renglones.every((r) => r.decision == null) ?? false;
    if (!recibo || recibo.estado !== "pendiente" || !sinRevisar) {
      redirect("/estimaciones/mis-recibos");
    }
    return (
      <CapturaElectrificacion
        puedeVerSugerido={puedeVerSugerido}
        contratistaFijo={contratistaFijo}
        reciboExistente={recibo}
      />
    );
  }

  const recibo = await buscarReciboPorFolio(supabase, folio, tipo);
  const sinRevisar = recibo?.renglones.every((r) => r.decision == null) ?? false;
  if (!recibo || recibo.estado !== "pendiente" || !sinRevisar) {
    redirect("/estimaciones/mis-recibos");
  }

  if (tipo === "armado") {
    return (
      <CapturaArmado
        puedeVerSugerido={puedeVerSugerido}
        contratistaFijo={contratistaFijo}
        reciboExistente={recibo}
      />
    );
  }
  return (
    <CapturaAcabados
      puedeVerSugerido={puedeVerSugerido}
      contratistaFijo={contratistaFijo}
      reciboExistente={recibo}
    />
  );
}
