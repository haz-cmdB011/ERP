import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";
import SinAcceso from "@/components/sin-acceso";
import { areasDePerfil, avisoSinAcceso, puedeEntrarAArea } from "@/lib/auth/acceso";
import { ResumenMenuProvider } from "@/components/resumen-menu";
import SubnavLink from "@/components/subnav-link";
import { puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import { contarPorRevisar } from "@/lib/estimaciones/por-revisar";

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

  // Solo las áreas asignadas: quien abre un enlace de otra área ve por qué no puede entrar y
  // cómo ir a la suya, en vez de moverlo en silencio.
  if (!puedeEntrarAArea(perfil, "calidad")) {
    return <SinAcceso {...avisoSinAcceso(perfil, "calidad")} />;
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
        areas={areasDePerfil(perfil)}
        porRevisar={porRevisar}
      >
        <SubnavLink href="/calidad" icono="pedidos" tambien={["/calidad/pedidos", "/calidad/ot"]}>
          Pedidos
        </SubnavLink>
        <SubnavLink href="/calidad/entregas" icono="por_revisar">
          Entregas
        </SubnavLink>
        <SubnavLink href="/calidad/cancelados" icono="cancelados">
          Cancelados
        </SubnavLink>
        <SubnavLink href="/calidad/folios" icono="folios">
          Folios de calidad
        </SubnavLink>
        <SubnavLink href="/calidad/incidencias" icono="incidencias">
          No conformidades
        </SubnavLink>
      </AreaNav>
      {children}
    </div>
    </ResumenMenuProvider>
  );
}
