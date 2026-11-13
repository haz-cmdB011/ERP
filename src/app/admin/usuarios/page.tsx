import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CrearUsuarioForm from "./crear-usuario-form";
import UsuariosTable from "./usuarios-table";
import type { RolValido, AreaValida, AreaMaquila } from "@/lib/auth/roles";

export interface PerfilRow {
  id: string;
  email: string | null;
  nombre_completo: string | null;
  rol: RolValido;
  area: AreaValida | null;
  contratista: string | null;
  areas_maquila: AreaMaquila[] | null;
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
    .select("id, email, nombre_completo, rol, area, contratista, areas_maquila, created_at")
    .order("created_at", { ascending: true })
    .returns<PerfilRow[]>();

  const lista = usuarios ?? [];
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Usuarios</h1>
      </div>

      <CrearUsuarioForm />

      <UsuariosTable usuarios={lista} miId={user.id} />
    </main>
  );
}
