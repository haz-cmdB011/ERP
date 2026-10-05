import { createClient } from "@/lib/supabase/server";
import { urlAvatar } from "@/lib/cuenta/avatar";
import PerfilForm from "@/app/planeacion/cuenta/perfil-form";
import CambiarPasswordForm from "@/app/planeacion/cuenta/cambiar-password-form";

// Pantalla "Mi perfil": foto, nombre y contraseña. La comparten Planeación
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
        <p className="mt-1 text-sm text-slate-500">
          Cambia tu nombre, tu foto y tu contraseña.
        </p>
      </div>
      <PerfilForm
        nombreInicial={perfil?.nombre_completo ?? ""}
        email={user.email ?? ""}
        avatarUrl={avatarUrl}
      />
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Contraseña</h2>
        <CambiarPasswordForm />
      </section>
    </main>
  );
}
