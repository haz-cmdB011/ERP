import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";
import SubnavLink from "@/components/subnav-link";
import {
  contarPendientes,
  contarRechazadas,
  listarResumenDiscrepancias,
} from "@/lib/estimaciones/discrepancias-resumen";
import { puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import { contarPorRevisar } from "@/lib/estimaciones/por-revisar";

// Globo con un número, para los contadores del menú.
function Globo({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="anim-aviso ml-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
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
  // Recibos esperando revisión: lo ve quien los revisa (la RLS le devuelve todos).
  const porRevisar = !maquilador && puedeVerPrecioSugerido(perfil) ? await contarPorRevisar(supabase) : 0;

  return (
    <div className="min-h-screen">
      <AreaNav
        area="estimaciones"
        email={user.email ?? ""}
        userId={user.id}
        avatarPath={user.app_metadata?.avatar_path}
        esDesarrollador={perfil?.rol === "desarrollador"}
        soloEstimaciones={maquilador}
        porRevisar={porRevisar}
      >
        {maquilador ? (
          <>
            <SubnavLink href="/estimaciones/recibos">
              Generador de Recibos
            </SubnavLink>
            <SubnavLink href="/estimaciones/mis-recibos">
              Mis recibos
              <Globo n={rechazadas} />
            </SubnavLink>
          </>
        ) : (
          <>
            <SubnavLink href="/estimaciones" tambien={["/estimaciones/pm-cobrado"]}>
              Panel
            </SubnavLink>
            <SubnavLink href="/estimaciones/recibos">
              Generador de Recibos
            </SubnavLink>
            <SubnavLink href="/estimaciones/registro?estado=pendiente">
              Por revisar
              <Globo n={porRevisar} />
            </SubnavLink>
            <SubnavLink href="/estimaciones/registro" excluye="estado=pendiente">
              Registro de recibos
            </SubnavLink>
            <SubnavLink href="/estimaciones/reportes">
              Reporte semanal
            </SubnavLink>
            {decideDiscrepancias && (
              <SubnavLink href="/estimaciones/discrepancias">
                Discrepancias
                <Globo n={pendientes} />
              </SubnavLink>
            )}
          </>
        )}
      </AreaNav>
      {children}
    </div>
  );
}
