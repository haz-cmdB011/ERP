import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esMaquilador, getPerfilActual, puedeCapturarTipo } from "@/lib/auth/get-perfil";
import type { AreaMaquila } from "@/lib/auth/roles";

const TIPOS: { tipo: AreaMaquila; titulo: string; descripcion: string }[] = [
  {
    tipo: "acabados",
    titulo: "Acabados",
    descripcion:
      "Maquila de acabados: captura lo que propone el maquilador y compáralo contra el precio sugerido.",
  },
  {
    tipo: "armado",
    titulo: "Armado",
    descripcion:
      "Maquila de armado (natural, laminado o colocación de herrajes): mismo control de precios que Acabados.",
  },
  {
    tipo: "electrificacion",
    titulo: "Electrificación",
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
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Generador de Recibos
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {esMaquilador(perfil)
            ? "Tipos de recibo de tus áreas de maquila."
            : "Tipos de recibo disponibles."}
        </p>
      </div>

      {disponibles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Tu usuario no tiene un área de maquila asignada. Pide a un administrador que te la asigne.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {disponibles.map((t) => (
            <Link
              key={t.tipo}
              href={`/estimaciones/recibos/${t.tipo}`}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
            >
              <h2 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600">
                {t.titulo}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{t.descripcion}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
