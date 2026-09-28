import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  esMaquilador,
  getPerfilActual,
  puedeCapturarTipo,
  puedeVerPrecioSugerido,
} from "@/lib/auth/get-perfil";
import CapturaAcabados from "./captura-acabados";

export default async function ReciboAcabadosPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  // El maquilador solo genera recibos de su(s) área(s).
  if (!puedeCapturarTipo(perfil, "acabados")) {
    redirect("/estimaciones/recibos");
  }

  return (
    <CapturaAcabados
      puedeVerSugerido={puedeVerPrecioSugerido(perfil)}
      contratistaFijo={esMaquilador(perfil) ? perfil?.contratista : null}
    />
  );
}
