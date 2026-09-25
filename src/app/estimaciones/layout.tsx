import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";

export default async function EstimacionesLayout({
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

  const maquilador = perfil?.rol === "maquilador";

  return (
    <div className="min-h-screen">
      <AreaNav
        area="estimaciones"
        email={user.email ?? ""}
        esDesarrollador={perfil?.rol === "desarrollador"}
        soloEstimaciones={maquilador}
      >
        {maquilador ? (
          <>
            <Link href="/estimaciones/recibos" className="text-gray-600 hover:text-black">
              Generador de Recibos
            </Link>
            <Link href="/estimaciones/mis-recibos" className="text-gray-600 hover:text-black">
              Mis recibos
            </Link>
          </>
        ) : (
          <>
            <Link href="/estimaciones" className="text-gray-600 hover:text-black">
              Panel
            </Link>
            <Link href="/estimaciones/recibos" className="text-gray-600 hover:text-black">
              Generador de Recibos
            </Link>
            <Link
              href="/estimaciones/registro?estado=pendiente"
              className="text-gray-600 hover:text-black"
            >
              Por revisar
            </Link>
            <Link href="/estimaciones/registro" className="text-gray-600 hover:text-black">
              Registro de recibos
            </Link>
          </>
        )}
      </AreaNav>
      {children}
    </div>
  );
}
