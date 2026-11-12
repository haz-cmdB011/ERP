import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";
import Marca from "@/components/marca";
import LogoutButton from "@/components/logout-button";
import CuentaPendiente from "@/components/cuenta-pendiente";
import { areasDePerfil } from "@/lib/auth/acceso";

export const metadata: Metadata = {
  title: { default: "Mi perfil", template: "%s · Mi perfil" },
};

// Mi perfil no es de ningún área: lo abre cualquiera, con el menú de sus propias áreas. Quien aún
// no tiene área (rol "usuario") solo tiene esta pantalla, con el aviso de que falta asignarla. El
// maquilador tiene la suya dentro de Estimaciones.
export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/cuenta");

  const { data: perfil } = await supabase.from("perfiles").select("rol, area").eq("id", user.id).single();
  if (perfil?.rol === "maquilador") redirect("/estimaciones/cuenta");

  const areas = areasDePerfil(perfil);
  const [primera] = areas;

  return (
    <div className="min-h-screen">
      {primera ? (
        <AreaNav
          area={primera === "admin" ? "usuarios" : primera}
          email={user.email ?? ""}
          userId={user.id}
          avatarPath={user.app_metadata?.avatar_path}
          areas={areas}
        />
      ) : (
        <header className="flex items-center justify-between gap-3 border-b border-nav-line bg-nav px-4 py-2.5 text-on-nav sm:px-6 print:hidden">
          <Marca sobreOscuro className="h-8 sm:h-10" />
          <div className="text-on-nav-suave">
            <LogoutButton />
          </div>
        </header>
      )}
      {!primera && <CuentaPendiente />}
      {children}
    </div>
  );
}
