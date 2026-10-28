import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import type { EncargadoEquipo, EquipoProduccion } from "@/lib/produccion/asignaciones";
import { leer } from "@/lib/supabase/leer";
import EquiposEditor from "./equipos-editor";

export const metadata: Metadata = { title: "Equipos" };

export default async function EquiposPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);

  const { data: equipos, error } = await supabase
    .from("equipos_produccion")
    .select("id, nombre, encargado, es_planta, procesos, activo")
    .order("activo", { ascending: false })
    .order("es_planta", { ascending: false })
    .order("nombre")
    .returns<EquipoProduccion[]>();
  const encargados = await leer(
    supabase
      .from("encargados_equipo_produccion")
      .select("equipo_id, nombre")
      .order("nombre")
      .returns<EncargadoEquipo[]>(),
    "los encargados de los equipos"
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Equipos</h1>
          <p className="mt-1 text-base text-slate-500">
            Los equipos del taller y quién los encabeza. Se eligen al asignar un mueble.
          </p>
        </div>
        <Link
          href="/produccion/equipos/calidad"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
        >
          Calidad por equipo
        </Link>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar los equipos: {error.message}
        </p>
      ) : (
        <EquiposEditor equipos={equipos ?? []} encargados={encargados ?? []} puedeEditar={puedeEditarProduccion(perfil)} />
      )}
    </main>
  );
}
