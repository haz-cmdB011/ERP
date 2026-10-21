// Lectura de los recibos de la O.T. de un mueble, para el pago al maquilador de la ficha
// del QR (ver pago-maquilador.ts). Con la sesión de quien escanea: si su rol no ve
// recibos, no aparece ninguno. Lanza ErrorLectura si una consulta falla.

import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";
import { claveOt } from "@/lib/estimaciones/conciliacion-pm";
import type { ReciboConRenglones } from "./pago-maquilador";

const COLUMNAS_RECIBO = "id, folio, ot, contratista, estado, creado_en, capturado_por, pagado_en, pagado_por";

type FilaRecibo = Omit<ReciboConRenglones, "area" | "renglones">;

export async function cargarRecibosDeOt(supabase: SupabaseClient, ot: string | null): Promise<ReciboConRenglones[]> {
  const clave = claveOt(ot);
  if (!clave) return [];
  // La O.T. viene escrita de muchas formas ("PM135-26 ETAPA 2", "OT 135-26"): aquí solo se
  // acota por texto; cobrosDelMueble compara con la misma clave que la base (ot_clave).
  const patron = `%${clave.replace(/[%_\\]/g, "")}%`;
  const [generales, electrificacion] = await Promise.all([
    leer(
      supabase
        .from("recibos")
        .select(`${COLUMNAS_RECIBO}, tipo, renglones ( modelo, descripcion_pm, cantidad, tipo_trabajo )`)
        .ilike("ot", patron)
        .returns<(FilaRecibo & { tipo: string; renglones: ReciboConRenglones["renglones"] })[]>(),
      "los recibos de la O.T."
    ),
    leer(
      supabase
        .from("recibos_electrificacion")
        .select(`${COLUMNAS_RECIBO}, renglones_electrificacion ( modelo, descripcion_pm, cantidad, planeacion_item_id )`)
        .ilike("ot", patron)
        .returns<(FilaRecibo & { renglones_electrificacion: ReciboConRenglones["renglones"] })[]>(),
      "los recibos de Electrificación de la O.T."
    ),
  ]);

  return [
    ...(generales ?? []).flatMap(({ tipo, renglones, ...r }): ReciboConRenglones[] =>
      tipo === "acabados" || tipo === "armado" ? [{ ...r, area: tipo, renglones: renglones ?? [] }] : []
    ),
    ...(electrificacion ?? []).map(({ renglones_electrificacion, ...r }) => ({
      ...r,
      area: "electrificacion" as const,
      renglones: renglones_electrificacion ?? [],
    })),
  ];
}
