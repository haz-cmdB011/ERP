"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { enviosPendientesDe, usuarioActualId } from "@/lib/offline/cola-navegador";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    // Capturas hechas sin red que todavía no llegaron al sistema: se mandan cuando esta misma
    // persona vuelve a entrar, así que se avisa antes de salir.
    try {
      const uid = await usuarioActualId();
      const sinEnviar = uid ? (await enviosPendientesDe(uid)).filter((e) => e.estado === "pendiente").length : 0;
      if (
        sinEnviar > 0 &&
        !window.confirm(
          `Tienes ${sinEnviar} captura${sinEnviar === 1 ? "" : "s"} guardada${sinEnviar === 1 ? "" : "s"} en este aparato que aún no llegó${sinEnviar === 1 ? "" : "ron"} al sistema. Si cierras sesión se enviarán cuando vuelvas a entrar con tu cuenta. ¿Cerrar sesión de todos modos?`
        )
      ) {
        return;
      }
    } catch {
      // Sin poder leer la cola: se cierra sesión normalmente.
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      className="group inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg sm:h-10 sm:w-10 xl:w-auto xl:px-2.5 text-on-nav-suave transition-colors hover:bg-nav-hover hover:text-on-nav focus-visible:outline-brand-500"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-1"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5M21 12H9" />
      </svg>
      <span className="hidden xl:inline">Cerrar sesión</span>
    </button>
  );
}
