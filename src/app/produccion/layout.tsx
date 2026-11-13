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
import BotonCarrito from "./boton-carrito";

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

  // Solo las áreas asignadas: quien abre un enlace de otra área ve por qué no puede entrar y
  // cómo ir a la suya, en vez de moverlo en silencio.
  if (!puedeEntrarAArea(perfil, "produccion")) {
    return <SinAcceso {...avisoSinAcceso(perfil, "produccion")} />;
  }

  // Aviso de recibos por revisar en la pestaña Estimaciones (solo a quien los revisa).
  const porRevisar = puedeVerPrecioSugerido(perfil) ? await contarPorRevisar(supabase).catch(() => 0) : 0;

  return (
    <ResumenMenuProvider>
    <div className="min-h-screen">
      <AreaNav
        area="produccion"
        email={user.email ?? ""}
        userId={user.id}
        avatarPath={user.app_metadata?.avatar_path}
        areas={areasDePerfil(perfil)}
        porRevisar={porRevisar}
      >
        <SubnavLink href="/produccion" icono="reporte">
          Inicio
        </SubnavLink>
        <SubnavLink href="/produccion/pedidos" icono="pedidos" tambien={["/produccion/ot"]}>
          Pedidos
        </SubnavLink>
        <SubnavLink href="/produccion/panel" icono="flujo">
          Panel de asignación
        </SubnavLink>
        <SubnavLink href="/produccion/rechazos" icono="retrabajo">
          Rechazos de Calidad
        </SubnavLink>
        <SubnavLink href="/produccion/equipos" icono="equipos">
          Equipos
        </SubnavLink>
        <SubnavLink href="/produccion/cancelados" tambien={["/produccion/folios"]} icono="archivo">
          Archivo
        </SubnavLink>
      </AreaNav>
      {children}
      <BotonCarrito />
    </div>
    </ResumenMenuProvider>
  );
}
