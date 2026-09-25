import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import CapturaElectrificacion from "./captura-electrificacion";

export default async function ReciboElectrificacionPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);

  return (
    <CapturaElectrificacion
      puedeVerSugerido={puedeVerPrecioSugerido(perfil)}
      contratistaFijo={esMaquilador(perfil) ? perfil?.contratista : null}
    />
  );
}
