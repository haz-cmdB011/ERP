import Link from "next/link";
import Chevron from "@/components/chevron";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual, puedeVerPrecioSugerido } from "@/lib/auth/get-perfil";
import ResumenPorLlegar, { ResumenPorLlegarCargando } from "./por-llegar/resumen-por-llegar";

const TARJETAS: {
  href: string;
  titulo: string;
  detalle: string;
  // Color propio de cada acceso (borde superior, velo y icono), sin perder el verde de la marca.
  tono: { tarjeta: string; icono: string };
  icono: React.ReactNode;
}[] = [
  {
    href: "/estimaciones/recibos",
    titulo: "Generador de Recibos",
    detalle: "Captura un recibo y compáralo contra el precio sugerido",
    tono: {
      tarjeta: "border-t-brand-500",
      icono: "bg-brand-100 text-brand-800 group-hover:bg-brand-500 group-hover:text-on-brand",
    },
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
    detalle: "Revisa, aprueba y marca como pagados",
    tono: {
      tarjeta: "border-t-brand-500",
      icono: "bg-brand-100 text-brand-800 group-hover:bg-brand-500 group-hover:text-on-brand",
    },
    icono: <path d="M4 6h16M4 12h16M4 18h10" />,
  },
  {
    href: "/estimaciones/reportes",
    titulo: "Análisis de pagos",
    detalle: "Gráficas y cierres por semana",
    tono: {
      tarjeta: "border-t-brand-500",
      icono: "bg-brand-100 text-brand-800 group-hover:bg-brand-500 group-hover:text-on-brand",
    },
    icono: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  },
];

export default async function EstimacionesPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (esMaquilador(perfil)) {
    redirect("/estimaciones/recibos");
  }

  // Solo quien ve el precio sugerido revisa recibos y ve lo que Calidad ya aprobó.
  const reviso = puedeVerPrecioSugerido(perfil);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Estimaciones</h1>
      </div>

      {/* Lo que Calidad ya aprobó y está por cobrarse: se carga aparte para no frenar el panel. */}
      {reviso && (
        <Suspense fallback={<ResumenPorLlegarCargando />}>
          <ResumenPorLlegar />
        </Suspense>
      )}

      {/* En el estilo Mobiliarium, un índice: una hoja con una fila por sección. */}
      <ul className="grid gap-4 sm:grid-cols-2 mob:flex mob:flex-col mob:gap-0 mob:divide-y mob:divide-slate-200 mob:overflow-hidden mob:rounded-xl mob:border mob:border-slate-200 mob:bg-white mob:shadow-sm">
        {TARJETAS.map((t) => (
          <li key={t.href} className="flex">
          <Link
            href={t.href}
            className={`group flex h-full flex-1 items-center gap-4 rounded-xl border border-slate-200 border-t-4 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md mob:rounded-none mob:border-0 mob:bg-transparent mob:px-5 mob:py-4 mob:shadow-none mob:hover:bg-slate-50 mob:hover:shadow-none ${t.tono.tarjeta}`}
          >
            <span
              className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${t.tono.icono} mob:h-6 mob:w-6 mob:rounded-none mob:bg-transparent mob:text-brand-700 mob:group-hover:bg-transparent mob:group-hover:text-brand-700`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                {t.icono}
              </svg>
            </span>
            <span className="min-w-0 mob:flex-1">
              <h2 className="text-base font-semibold text-slate-900 mob:font-serif mob:text-lg mob:font-medium">{t.titulo}</h2>
              <p className="text-sm text-slate-500">{t.detalle}</p>
            </span>
            <Chevron abierto={false} className="hidden h-4 w-4 text-slate-400 transition-colors group-hover:text-slate-700 mob:block" />
          </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
