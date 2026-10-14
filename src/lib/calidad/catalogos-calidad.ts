// Lee en el navegador los catálogos de Calidad (motivos, áreas con responsables
// y autorizadores). Cambian muy poco: se piden una vez por sesión de pantalla.

import { createClient } from "@/lib/supabase/client";
import type { CatalogosCalidad } from "./no-conformidad";

let pendiente: Promise<CatalogosCalidad> | null = null;

export function cargarCatalogosCalidad(): Promise<CatalogosCalidad> {
  if (!pendiente) {
    const supabase = createClient();
    const intento = Promise.all([
      supabase.from("motivos_calidad").select("codigo, nombre, tipo").eq("activo", true).order("codigo"),
      supabase.from("areas_calidad").select("area, responsable").eq("activo", true).order("area").order("responsable"),
      supabase.from("autorizadores_calidad").select("nombre, puesto").eq("activo", true).order("nombre"),
    ]).then(([m, a, u]) => {
      const error = m.error ?? a.error ?? u.error;
      if (error) throw new Error(error.message);
      return {
        motivos: (m.data ?? []) as CatalogosCalidad["motivos"],
        areas: (a.data ?? []) as CatalogosCalidad["areas"],
        autorizadores: (u.data ?? []) as CatalogosCalidad["autorizadores"],
      };
    });
    // Si falla, la próxima vez se vuelve a intentar.
    intento.catch(() => {
      pendiente = null;
    });
    pendiente = intento;
  }
  return pendiente;
}
