import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";

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
        area="produccion"
        email={user.email ?? ""}
        esDesarrollador={perfil?.rol === "desarrollador"}
      >
        <Link href="/produccion" className="text-gray-600 hover:text-black">
          Pedidos
        </Link>
        <Link href="/produccion/asignaciones" className="text-gray-600 hover:text-black">
          Asignaciones
        </Link>
        <Link href="/produccion/cancelados" className="text-gray-600 hover:text-black">
          Cancelados / Eliminados
        </Link>
        <Link href="/produccion/folios" className="text-gray-600 hover:text-black">
          Folios de producción
        </Link>
      </AreaNav>
      {children}
    </div>
  );
}
