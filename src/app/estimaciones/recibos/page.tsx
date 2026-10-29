import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual, puedeCapturarTipo } from "@/lib/auth/get-perfil";
import type { AreaMaquila } from "@/lib/auth/roles";
import Bienvenida from "@/components/bienvenida";
import EstadoVacio from "@/components/estado-vacio";

const TIPOS: { tipo: AreaMaquila; titulo: string; descripcion: string; tono: string; letra: string; icono: React.ReactNode }[] = [
  {
    tipo: "acabados",
    titulo: "Acabados",
    icono: <path d="M18 3l3 3-9 9-3-3zM9 12c-2.5 0-4 1.5-4 4 0 1.5-1 2.5-2 3 3 1 7 .5 8-3 .3-1-.5-2.5-2-4z" />,
    tono: "border-t-emerald-500",
    letra: "bg-emerald-100 text-emerald-800 group-hover:bg-emerald-500 group-hover:text-white",
    descripcion:
      "Maquila de acabados: captura lo que propone el maquilador y compáralo contra el precio sugerido.",
  },
  {
    tipo: "armado",
    titulo: "Armado",
    icono: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />,
    tono: "border-t-emerald-500",
    letra: "bg-emerald-100 text-emerald-800 group-hover:bg-emerald-500 group-hover:text-white",
    descripcion:
      "Maquila de armado (natural, laminado o colocación de herrajes): mismo control de precios que Acabados.",
  },
  {
    tipo: "electrificacion",
    titulo: "Electrificación",
    icono: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
    tono: "border-t-emerald-500",
    letra: "bg-emerald-100 text-emerald-800 group-hover:bg-emerald-500 group-hover:text-white",
    descripcion:
      "Maquila de electrificación: modelo, metros de LED y kit de charolas, comparado contra el precio sugerido.",
  },
];

export default async function GeneradorRecibosPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  // El maquilador solo ve los tipos de su(s) área(s) de maquila.
  const disponibles = TIPOS.filter((t) => puedeCapturarTipo(perfil, t.tipo));

  // Con una sola área no hay nada que elegir: directo a su captura.
  if (esMaquilador(perfil) && disponibles.length === 1) {
    redirect(`/estimaciones/recibos/${disponibles[0].tipo}`);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Bienvenida />
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Generador de Recibos
        </h1>
      </div>

      {disponibles.length === 0 ? (
        <EstadoVacio
          titulo="Aún no tienes un área de maquila"
          descripcion="Pide a un administrador que te asigne una para poder generar recibos."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {disponibles.map((t) => (
            <Link
              key={t.tipo}
              href={`/estimaciones/recibos/${t.tipo}`}
              className={`group flex items-start gap-4 rounded-xl border border-slate-200 border-t-4 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${t.tono}`}
            >
              <span
                className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${t.letra}`}
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  {t.icono}
                </svg>
              </span>
              <span className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900">{t.titulo}</h2>
                <p className="mt-1 text-sm text-slate-500">{t.descripcion}</p>
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
