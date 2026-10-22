import { redirect } from "next/navigation";

// La lista de asignaciones ahora es la vista "Lista" de /produccion/taller; se conservan los filtros
// de la dirección (?estado=…&equipo=…&pagina=…).
export default async function AsignacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ vista: "lista" });
  for (const [clave, valor] of Object.entries(params)) {
    if (clave === "vista") continue;
    const v = Array.isArray(valor) ? valor[0] : valor;
    if (v !== undefined) query.set(clave, v);
  }
  redirect(`/produccion/taller?${query.toString()}`);
}
