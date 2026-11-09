import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";
import SinAcceso from "@/components/sin-acceso";
import { areasDePerfil, inicioDePerfil, puedeEntrarAArea } from "@/lib/auth/acceso";
import SubnavLink from "@/components/subnav-link";
import { contarPorRevisar } from "@/lib/estimaciones/por-revisar";

// Usuarios vive como panel propio (mismo peso visual que Planeación y
// Producción en AreaNav), pero solo es accesible para desarrolladores:
// cualquier otro rol ve el aviso de sin acceso en lugar de /admin/*.
export const metadata: Metadata = {
  title: { default: "Administración", template: "%s · Administración" },
};

export default async function AdminLayout({
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

  if (!puedeEntrarAArea(perfil, "admin")) {
    return (
      <SinAcceso
        titulo="Esta pantalla es solo para desarrolladores"
        mensaje="Tu cuenta no tiene acceso a Administración."
        hrefInicio={inicioDePerfil(perfil)}
        etiquetaInicio="Ir al inicio"
      />
    );
  }

  return (
    <div className="min-h-screen">
      <AreaNav
        area="usuarios"
        email={user.email ?? ""}
        userId={user.id}
        avatarPath={user.app_metadata?.avatar_path}
        areas={areasDePerfil(perfil)}
        porRevisar={await contarPorRevisar(supabase).catch(() => 0)}
      >
        <SubnavLink href="/admin/usuarios" icono="usuarios">
          Usuarios
        </SubnavLink>
        <SubnavLink href="/admin/auditoria" icono="auditoria">
          Auditoría
        </SubnavLink>
        <SubnavLink href="/estimaciones/discrepancias" icono="discrepancias">
          Discrepancias
        </SubnavLink>
      </AreaNav>
      {children}
    </div>
  );
}
