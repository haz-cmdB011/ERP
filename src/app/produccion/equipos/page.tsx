import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import type { EquipoProduccion } from "@/lib/produccion/asignaciones";
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

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Equipos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Equipos de maquiladores (armado y barniz) y la planta, a quienes se les asignan los muebles.
        </p>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar los equipos: {error.message}
        </p>
      ) : (
        <EquiposEditor equipos={equipos ?? []} puedeEditar={puedeEditarProduccion(perfil)} />
      )}
    </main>
  );
}
