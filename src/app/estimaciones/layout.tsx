import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";
import {
  contarPendientes,
  contarRechazadas,
  listarResumenDiscrepancias,
} from "@/lib/estimaciones/discrepancias-resumen";

// Globo con un número, para los contadores del menú.
function Globo({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
      {n}
    </span>
  );
}

export const metadata: Metadata = {
  title: { default: "Estimaciones", template: "%s · Estimaciones" },
};

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
    .select("rol, area")
    .eq("id", user.id)
    .single();

  const maquilador = perfil?.rol === "maquilador";
  const decideDiscrepancias =
    perfil?.rol === "desarrollador" ||
    (perfil?.rol === "administrador" && perfil.area === "estimaciones");

  // Contadores del menú. La RLS decide qué cuenta cada quien: quien decide ve
  // todas las pendientes; el maquilador, los rechazos de sus propios recibos.
  const resumen =
    decideDiscrepancias || maquilador ? await listarResumenDiscrepancias(supabase) : [];
  const pendientes = decideDiscrepancias ? contarPendientes(resumen) : 0;
  const rechazadas = maquilador ? contarRechazadas(resumen) : 0;

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
              <Globo n={rechazadas} />
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
            <Link href="/estimaciones/reportes" className="text-gray-600 hover:text-black">
              Reporte semanal
            </Link>
            {decideDiscrepancias && (
              <Link href="/estimaciones/discrepancias" className="text-gray-600 hover:text-black">
                Discrepancias
                <Globo n={pendientes} />
              </Link>
            )}
          </>
        )}
      </AreaNav>
      {children}
    </div>
  );
}
