import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import CapturaAcabados from "./captura-acabados";

export default async function ReciboAcabadosPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);

  return (
    <CapturaAcabados
      puedeVerSugerido={puedeVerPrecioSugerido(perfil)}
      contratistaFijo={esMaquilador(perfil) ? perfil?.contratista : null}
    />
  );
}
