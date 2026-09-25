import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";

export default async function PlaneacionLayout({
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

  // El maquilador es externo: solo tiene acceso a Estimaciones.
  if (perfil?.rol === "maquilador") {
    redirect("/estimaciones/recibos");
  }

  return (
    <div className="min-h-screen">
      <AreaNav
        area="planeacion"
        email={user.email ?? ""}
        esDesarrollador={perfil?.rol === "desarrollador"}
      >
        <Link href="/planeacion" className="text-gray-600 hover:text-black">
          Pedidos
        </Link>
        <Link href="/planeacion/upload" className="text-gray-600 hover:text-black">
          Cargar Excel
        </Link>
        <Link href="/planeacion/cancelados" className="text-gray-600 hover:text-black">
          Cancelados
        </Link>
      </AreaNav>
      {children}
    </div>
  );
}
