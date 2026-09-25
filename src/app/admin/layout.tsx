import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";

// Usuarios vive como panel propio (mismo peso visual que Planeación y
// Producción en AreaNav), pero solo es accesible para desarrolladores:
// cualquier otro rol se redirige antes de renderizar nada de /admin/*.
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
      <AreaNav area="usuarios" email={user.email ?? ""} esDesarrollador>
        <Link href="/admin/usuarios" className="text-gray-600 hover:text-black">
          Usuarios
        </Link>
        <Link href="/admin/auditoria" className="text-gray-600 hover:text-black">
          Auditoría
        </Link>
      </AreaNav>
      {children}
    </div>
  );
}
