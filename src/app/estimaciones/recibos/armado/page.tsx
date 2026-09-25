import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import CapturaArmado from "./captura-armado";

export default async function ReciboArmadoPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);

  return (
    <CapturaArmado
      puedeVerSugerido={puedeVerPrecioSugerido(perfil)}
      contratistaFijo={esMaquilador(perfil) ? perfil?.contratista : null}
    />
  );
}
