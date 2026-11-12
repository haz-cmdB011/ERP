import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inicioDePerfil } from "@/lib/auth/acceso";

// Inicio del sitio: sin sesión al login; con sesión, al inicio de su área (el maquilador, a sus
// recibos; el desarrollador, a Planeación; quien no tiene área, a su perfil).
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("perfiles").select("rol, area").eq("id", user.id).single();
  redirect(inicioDePerfil(perfil));
}
