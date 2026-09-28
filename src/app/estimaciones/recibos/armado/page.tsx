import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  esMaquilador,
  getPerfilActual,
  puedeCapturarTipo,
  puedeVerPrecioSugerido,
} from "@/lib/auth/get-perfil";
import CapturaArmado from "./captura-armado";

export default async function ReciboArmadoPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  // El maquilador solo genera recibos de su(s) área(s).
  if (!puedeCapturarTipo(perfil, "armado")) {
    redirect("/estimaciones/recibos");
  }

  return (
    <CapturaArmado
      puedeVerSugerido={puedeVerPrecioSugerido(perfil)}
      contratistaFijo={esMaquilador(perfil) ? perfil?.contratista : null}
    />
  );
}
