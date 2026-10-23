import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual } from "@/lib/auth/get-perfil";
import Bienvenida from "@/components/bienvenida";

const TARJETAS: {
  href: string;
  titulo: string;
  icono: React.ReactNode;
}[] = [
  {
    href: "/estimaciones/recibos",
    titulo: "Generador de Recibos",
    icono: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </>
    ),
  },
  {
    href: "/estimaciones/registro",
    titulo: "Registro de recibos",
    icono: <path d="M4 6h16M4 12h16M4 18h10" />,
  },
  {
    href: "/estimaciones/reportes",
    titulo: "Análisis de pagos",
    icono: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  },
];

export default async function EstimacionesPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (esMaquilador(perfil)) {
    redirect("/estimaciones/recibos");
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida />
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Estimaciones</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TARJETAS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group flex h-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-300"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-800 transition-colors group-hover:bg-brand-500 group-hover:text-on-brand">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                {t.icono}
              </svg>
            </span>
            <span className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 group-hover:text-brand-700">
                {t.titulo}
              </h2>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
