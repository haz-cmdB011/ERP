// Lectura de los recibos REVISADOS que todavía no se pagan (el "compromiso" de
// la semana). Lanza ErrorLectura si algo falla: una cifra incompleta engaña.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import type { ReciboPorPagar } from "./reporte-control";
import type { TipoCualquierRecibo } from "./revision-db";

interface FilaDb {
  folio: string;
  contratista: string | null;
  revisado_en: string | null;
}

type RenglonDb = { cantidad: number; pu_aceptado: number | null };

const importeDe = (rs: RenglonDb[]) =>
  rs.reduce((s, x) => s + Number(x.cantidad) * Number(x.pu_aceptado ?? 0), 0);

export async function cargarRevisadosSinPagar(supabase: SupabaseClient): Promise<ReciboPorPagar[]> {
  const [aa, el] = await Promise.all([
    paginarTodo<FilaDb & { tipo: TipoCualquierRecibo; renglones: RenglonDb[] }>(
      (d, h) =>
        supabase
          .from("recibos")
          .select("tipo, folio, contratista, revisado_en, renglones(cantidad, pu_aceptado)")
          .eq("estado", "revisado")
          .order("revisado_en", { nullsFirst: true })
          .order("id")
          .range(d, h)
          .returns<(FilaDb & { tipo: TipoCualquierRecibo; renglones: RenglonDb[] })[]>(),
      { contexto: "los recibos revisados de Acabados y Armado" }
    ),
    paginarTodo<FilaDb & { renglones_electrificacion: RenglonDb[] }>(
      (d, h) =>
        supabase
          .from("recibos_electrificacion")
          .select("folio, contratista, revisado_en, renglones_electrificacion(cantidad, pu_aceptado)")
          .eq("estado", "revisado")
          .order("revisado_en", { nullsFirst: true })
          .order("id")
          .range(d, h)
          .returns<(FilaDb & { renglones_electrificacion: RenglonDb[] })[]>(),
      { contexto: "los recibos revisados de Electrificación" }
    ),
  ]);

  const aRecibo = (r: FilaDb, tipo: TipoCualquierRecibo, rs: RenglonDb[]): ReciboPorPagar => ({
    tipo,
    folio: r.folio,
    contratista: (r.contratista ?? "").trim() || "Sin contratista",
    revisadoEn: r.revisado_en,
    importe: importeDe(rs),
  });

  return [
    ...aa.map((r) => aRecibo(r, r.tipo, r.renglones)),
    ...el.map((r) => aRecibo(r, "electrificacion", r.renglones_electrificacion)),
  ];
}
