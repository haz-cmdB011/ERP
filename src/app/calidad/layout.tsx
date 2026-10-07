import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";
import SubnavLink from "@/components/subnav-link";
import { puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import { contarPorRevisar } from "@/lib/estimaciones/por-revisar";
import CuentaPendiente from "@/components/cuenta-pendiente";

export const metadata: Metadata = {
  title: { default: "Calidad", template: "%s · Calidad" },
};

export default async function CalidadLayout({
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
  const porRevisar = puedeVerPrecioSugerido(perfil) ? await contarPorRevisar(supabase).catch(() => 0) : 0;

  return (
    <div className="min-h-screen">
      <AreaNav
        area="calidad"
        email={user.email ?? ""}
        userId={user.id}
        avatarPath={user.app_metadata?.avatar_path}
        esDesarrollador={perfil?.rol === "desarrollador"}
        porRevisar={porRevisar}
      >
        <SubnavLink href="/calidad" icono="pedidos" tambien={["/calidad/pedidos", "/calidad/ot"]}>
          Pedidos
        </SubnavLink>
        <SubnavLink href="/calidad/entregas" icono="por_revisar">
          Entregas por inspeccionar
        </SubnavLink>
        <SubnavLink href="/calidad/escanear" icono="escanear">
          Escanear QR
        </SubnavLink>
        <SubnavLink href="/calidad/cancelados" icono="cancelados">
          Cancelados
        </SubnavLink>
        <SubnavLink href="/calidad/folios" icono="folios">
          Folios de calidad
        </SubnavLink>
      </AreaNav>
      {perfil?.rol === "usuario" && <CuentaPendiente />}
      {children}
    </div>
  );
}
