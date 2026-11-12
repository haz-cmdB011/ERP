import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Cuántos rechazos de Calidad esperan que Producción los reasigne como retrabajo: los de cada lote
// (rechazos_calidad) y los de la revisión final (rechazos_revision_final), con piezas por reasignar. Es el
// mismo criterio de la pantalla de Rechazos. Es un aviso: si no se puede leer devuelve 0 y no tumba el inicio.
export async function contarRechazosPorReasignar(supabase: Supabase): Promise<number> {
  const cuenta = async (vista: "rechazos_calidad" | "rechazos_revision_final"): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from(vista)
        .select("*", { count: "exact", head: true })
        .eq("vigente", true)
        .gt("por_reasignar", 0);
      return error ? 0 : (count ?? 0);
    } catch {
      return 0;
    }
  };
  const [lotes, final] = await Promise.all([cuenta("rechazos_calidad"), cuenta("rechazos_revision_final")]);
  return lotes + final;
}
