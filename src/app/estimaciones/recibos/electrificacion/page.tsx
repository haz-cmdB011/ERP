import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  esMaquilador,
  getPerfilActual,
  puedeCapturarTipo,
  puedeVerPrecioSugerido,
} from "@/lib/auth/get-perfil";
import CapturaElectrificacion from "./captura-electrificacion";

export default async function ReciboElectrificacionPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  // El maquilador solo genera recibos de su(s) área(s).
  if (!puedeCapturarTipo(perfil, "electrificacion")) {
    redirect("/estimaciones/recibos");
  }

  return (
    <CapturaElectrificacion
      puedeVerSugerido={puedeVerPrecioSugerido(perfil)}
      contratistaFijo={esMaquilador(perfil) ? perfil?.contratista : null}
    />
  );
}
