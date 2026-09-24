import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import CapturaAcabados from "./captura-acabados";

export default async function ReciboAcabadosPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);

  return <CapturaAcabados puedeVerSugerido={puedeVerPrecioSugerido(perfil)} />;
}
