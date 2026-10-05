import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";
import SubnavLink from "@/components/subnav-link";
import { contarPorRevisar } from "@/lib/estimaciones/por-revisar";

// Usuarios vive como panel propio (mismo peso visual que Planeación y
// Producción en AreaNav), pero solo es accesible para desarrolladores:
// cualquier otro rol se redirige antes de renderizar nada de /admin/*.
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
    .select("rol")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "desarrollador") {
    redirect("/planeacion");
  }

  return (
    <div className="min-h-screen">
      <AreaNav
        area="usuarios"
        email={user.email ?? ""}
        userId={user.id}
        avatarPath={user.app_metadata?.avatar_path}
        esDesarrollador
        porRevisar={await contarPorRevisar(supabase)}
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
