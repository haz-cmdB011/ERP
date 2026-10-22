import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AreaNav from "@/components/area-nav";
import SinAcceso from "@/components/sin-acceso";
import { puedeEntrarAArea } from "@/lib/auth/acceso";
import { ResumenMenuProvider } from "@/components/resumen-menu";
import SubnavLink from "@/components/subnav-link";
import { puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import { contarPorRevisar } from "@/lib/estimaciones/por-revisar";
import CuentaPendiente from "@/components/cuenta-pendiente";
import BotonCarrito from "./boton-carrito";

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
    .select("rol, area")
    .eq("id", user.id)
    .single();

  // El maquilador es externo: solo tiene acceso a Estimaciones. No se le mueve en silencio (un enlace
  // a esta pantalla parecería no funcionar): se le avisa y se le ofrece ir a lo suyo.
  if (!puedeEntrarAArea(perfil?.rol, "produccion")) {
    return (
      <SinAcceso
        titulo="Esta pantalla es del personal interno"
        mensaje="Tu cuenta es de maquilador y solo tiene acceso a Estimaciones."
        hrefInicio="/estimaciones/recibos"
        etiquetaInicio="Ir a mis recibos"
      />
    );
  }

  // Aviso de recibos por revisar en la pestaña Estimaciones (solo a quien los revisa).
  const porRevisar = puedeVerPrecioSugerido(perfil) ? await contarPorRevisar(supabase).catch(() => 0) : 0;

  return (
    <ResumenMenuProvider>
    <div className="min-h-screen">
      <AreaNav
        area="produccion"
        email={user.email ?? ""}
        userId={user.id}
        avatarPath={user.app_metadata?.avatar_path}
        esDesarrollador={perfil?.rol === "desarrollador"}
        porRevisar={porRevisar}
      >
        <SubnavLink href="/produccion" icono="pedidos" tambien={["/produccion/pedidos", "/produccion/ot"]}>
          Pedidos
        </SubnavLink>
        <SubnavLink href="/produccion/panel" icono="flujo">
          Panel de asignación
        </SubnavLink>
        <SubnavLink href="/produccion/tablero" icono="panel">
          Tablero del taller
        </SubnavLink>
        <SubnavLink href="/produccion/asignaciones" icono="asignaciones">
          Asignaciones
        </SubnavLink>
        <SubnavLink href="/produccion/equipos" icono="equipos">
          Equipos
        </SubnavLink>
        <SubnavLink href="/produccion/rechazos" icono="retrabajo">
          Rechazado por Calidad
        </SubnavLink>
        <SubnavLink href="/produccion/escanear" icono="escanear">
          Escanear QR
        </SubnavLink>
        <SubnavLink href="/produccion/cancelados" icono="cancelados">
          Cancelados / Eliminados
        </SubnavLink>
        <SubnavLink href="/produccion/folios" icono="folios">
          Folios de producción
        </SubnavLink>
      </AreaNav>
      {perfil?.rol === "usuario" && <CuentaPendiente />}
      {children}
      <BotonCarrito />
    </div>
    </ResumenMenuProvider>
  );
}
