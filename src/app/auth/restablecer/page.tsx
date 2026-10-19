import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuthShell from "@/components/auth-shell";
import RestablecerForm from "./restablecer-form";

export const metadata: Metadata = { title: "Nueva contraseña" };

// Destino del enlace de "¿Olvidaste tu contraseña?" (ver /auth/callback): ahí ya hay una sesión
// abierta por el enlace de recuperación. Sin sesión (enlace vencido o pantalla abierta a mano) se
// manda al login, donde se puede pedir otro.
export default async function RestablecerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=enlace");

  return (
    <AuthShell
      titulo="Nueva contraseña"
      descripcion="Escribe la contraseña nueva para tu cuenta y confírmala."
      sinAvisoPrivacidad
    >
      <RestablecerForm />
    </AuthShell>
  );
}
