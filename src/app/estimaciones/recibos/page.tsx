import Link from "next/link";
import Chevron from "@/components/chevron";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual, puedeCapturarTipo } from "@/lib/auth/get-perfil";
import type { AreaMaquila } from "@/lib/auth/roles";
import EstadoVacio from "@/components/estado-vacio";

const TIPOS: { tipo: AreaMaquila; titulo: string; descripcion: string; icono: React.ReactNode }[] = [
  {
    tipo: "acabados",
    titulo: "Acabados",
    icono: <path d="M18 3l3 3-9 9-3-3zM9 12c-2.5 0-4 1.5-4 4 0 1.5-1 2.5-2 3 3 1 7 .5 8-3 .3-1-.5-2.5-2-4z" />,
    descripcion:
      "Maquila de acabados: captura lo que propone el maquilador y compáralo contra el precio sugerido.",
  },
  {
    tipo: "armado",
    titulo: "Armado",
    icono: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />,
    descripcion:
      "Maquila de armado (natural, laminado o colocación de herrajes): mismo control de precios que Acabados.",
  },
  {
    tipo: "electrificacion",
    titulo: "Electrificación",
    icono: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
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
        // Índice de los tipos de recibo: una hoja con una fila por tipo.
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {disponibles.map((t) => (
            <li key={t.tipo}>
              <Link
                href={`/estimaciones/recibos/${t.tipo}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6 shrink-0 text-brand-700"
                  aria-hidden="true"
                >
                  {t.icono}
                </svg>
                <span className="min-w-0 flex-1">
                  <h2 className="font-serif text-lg font-medium text-slate-900">{t.titulo}</h2>
                  <p className="mt-0.5 text-sm text-slate-500">{t.descripcion}</p>
                </span>
                <Chevron abierto={false} className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-700" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
