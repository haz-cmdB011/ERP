import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inicioDeRol } from "@/lib/auth/acceso";

// Inicio del sitio: sin sesión al login; con sesión, a la pantalla de inicio de su rol (el
// maquilador, a Estimaciones; los demás, a Planeación).
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).single();
  redirect(inicioDeRol(perfil?.rol));
}
