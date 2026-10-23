import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";
import SinAcceso from "@/components/sin-acceso";
import { puedeEntrarAArea } from "@/lib/auth/acceso";
import { ResumenMenuProvider } from "@/components/resumen-menu";
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

  // El maquilador es externo: solo tiene acceso a Estimaciones. No se le mueve en silencio (un enlace
  // a esta pantalla parecería no funcionar): se le avisa y se le ofrece ir a lo suyo.
  if (!puedeEntrarAArea(perfil?.rol, "calidad")) {
    return (
      <SinAcceso
        titulo="Esta pantalla es del personal interno"
        mensaje="Tu cuenta es de maquilador y solo tiene acceso a Estimaciones."
        hrefInicio="/estimaciones/recibos"
        etiquetaInicio="Ir a mis recibos"
      />
    );
  }

  // Aviso de recibos por revisar en la pestaña Estimaciones (solo a quien los revisa).
  const porRevisar = puedeVerPrecioSugerido(perfil) ? await contarPorRevisar(supabase).catch(() => 0) : 0;

  return (
    <ResumenMenuProvider>
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
        <SubnavLink href="/calidad/entregas" tambien={["/calidad/incidencias"]} icono="por_revisar">
          Revisión
        </SubnavLink>
        <SubnavLink href="/calidad/escanear" icono="escanear">
          Escanear QR
        </SubnavLink>
        <SubnavLink href="/calidad/cancelados" tambien={["/calidad/folios"]} icono="archivo">
          Archivo
        </SubnavLink>
      </AreaNav>
      {perfil?.rol === "usuario" && <CuentaPendiente />}
      {children}
    </div>
    </ResumenMenuProvider>
  );
}
