import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";

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
    .select("rol")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen">
      <AreaNav
        area="produccion"
        email={user.email ?? ""}
        esDesarrollador={perfil?.rol === "desarrollador"}
      >
        <Link href="/produccion" className="text-gray-600 hover:text-black">
          Pedidos
        </Link>
        <Link href="/produccion/cancelados" className="text-gray-600 hover:text-black">
          Cancelados / Eliminados
        </Link>
      </AreaNav>
      {children}
    </div>
  );
}
