import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";

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
    .select("rol")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen">
      <AreaNav
        area="calidad"
        email={user.email ?? ""}
        esDesarrollador={perfil?.rol === "desarrollador"}
      >
        <Link href="/calidad" className="text-gray-600 hover:text-black">
          Pedidos
        </Link>
        <Link href="/calidad/cancelados" className="text-gray-600 hover:text-black">
          Cancelados
        </Link>
        <Link href="/calidad/folios" className="text-gray-600 hover:text-black">
          Folios de calidad
        </Link>
      </AreaNav>
      {children}
    </div>
  );
}
