import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvitarForm from "./invitar-form";
import UsuariosTable from "./usuarios-table";

export interface PerfilRow {
  id: string;
  email: string | null;
  nombre_completo: string | null;
  rol: "admin" | "planeacion" | "area";
  area: "produccion" | "calidad" | "estimaciones" | "finanzas" | null;
  created_at: string;
}

export default async function AdminUsuariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: miPerfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (miPerfil?.rol !== "admin") {
    redirect("/planeacion");
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
          Invita nuevos usuarios y asigna su rol. Solo administradores pueden
          ver esta página.
        </p>
      </div>

      <InvitarForm />

      <UsuariosTable usuarios={usuarios ?? []} miId={user.id} />
    </main>
  );
}
