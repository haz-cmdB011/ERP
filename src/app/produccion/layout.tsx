import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";
import SubnavLink from "@/components/subnav-link";
import { puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import { contarPorRevisar } from "@/lib/estimaciones/por-revisar";

export const metadata: Metadata = {
  title: { default: "Producción", template: "%s · Producción" },
};

export default async function ProduccionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, area")
    .eq("id", user.id)
    .single();

  // El maquilador es externo: solo tiene acceso a Estimaciones.
  if (perfil?.rol === "maquilador") {
    redirect("/estimaciones/recibos");
  }

  // Aviso de recibos por revisar en la pestaña Estimaciones (solo a quien los revisa).
  const porRevisar = puedeVerPrecioSugerido(perfil) ? await contarPorRevisar(supabase) : 0;

  return (
    <div className="min-h-screen">
      <AreaNav
        area="produccion"
        email={user.email ?? ""}
        userId={user.id}
        avatarPath={user.app_metadata?.avatar_path}
        esDesarrollador={perfil?.rol === "desarrollador"}
        porRevisar={porRevisar}
      >
        <SubnavLink href="/produccion" tambien={["/produccion/pedidos"]}>
          Pedidos
        </SubnavLink>
        <SubnavLink href="/produccion/cancelados">
          Cancelados / Eliminados
        </SubnavLink>
        <SubnavLink href="/produccion/folios">
          Folios de producción
        </SubnavLink>
      </AreaNav>
      {children}
    </div>
  );
}
