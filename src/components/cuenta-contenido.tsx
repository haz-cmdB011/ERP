import { createClient } from "@/lib/supabase/server";
import { urlAvatar } from "@/lib/cuenta/avatar";
import PerfilForm from "@/app/planeacion/cuenta/perfil-form";
import MfaForm from "@/app/planeacion/cuenta/mfa-form";
import PendientesCuenta from "./pendientes-cuenta";

// Pantalla "Mi perfil": foto, nombre y verificación en dos pasos. La contraseña ya no se cambia
// aquí: se restablece desde el login con "¿Olvidaste tu contraseña?" (/auth/restablecer). La comparten Planeación
// (/planeacion/cuenta) y Estimaciones (/estimaciones/cuenta, para los
// maquiladores, que solo tienen esa área).
export default async function CuentaContenido() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre_completo")
    .eq("id", user.id)
    .single();
  const avatarUrl = await urlAvatar(user.id, user.app_metadata?.avatar_path);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Mi perfil</h1>
      </div>
      <PendientesCuenta enPerfil />
      <div id="datos" className="scroll-mt-24">
        <PerfilForm
          nombreInicial={perfil?.nombre_completo ?? ""}
          email={user.email ?? ""}
          avatarUrl={avatarUrl}
        />
      </div>
      <section
        id="verificacion"
        className="flex scroll-mt-24 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-base font-semibold text-slate-900">Verificación en dos pasos</h2>
        <MfaForm />
      </section>
    </main>
  );
}
