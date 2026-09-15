import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CrearUsuarioForm from "./crear-usuario-form";
import UsuariosTable from "./usuarios-table";
import type { RolValido, AreaValida } from "@/lib/auth/roles";

export interface PerfilRow {
  id: string;
  email: string | null;
  nombre_completo: string | null;
  rol: RolValido;
  area: AreaValida | null;
  created_at: string;
}

// El acceso (solo desarrollador) ya lo valida admin/layout.tsx antes de
// llegar aquí — esta página asume que quien la ve ya está autorizado.
export default async function AdminUsuariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: usuarios } = await supabase
    .from("perfiles")
    .select("id, email, nombre_completo, rol, area, created_at")
    .order("created_at", { ascending: true })
    .returns<PerfilRow[]>();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <p className="text-sm text-gray-600">
          Crea usuarios nuevos, asígnales rol y restablece contraseñas. Solo
          desarrolladores pueden ver esta página.
        </p>
      </div>

      <CrearUsuarioForm />

      <UsuariosTable usuarios={usuarios ?? []} miId={user.id} />
    </main>
  );
}
