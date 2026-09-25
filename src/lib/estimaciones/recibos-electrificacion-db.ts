// Lectura/escritura de recibos de Electrificación contra Supabase
// (tablas `recibos_electrificacion` / `renglones_electrificacion` /
// `charolas_electrificacion`, RPC `guardar_recibo_electrificacion` — ver
// supabase/migrations/20260925174825_estimaciones_electrificacion.sql y
// 20260925182653_electrificacion_cantidad.sql). Precios por pieza; el
// importe es cantidad × pu_aceptado.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Banda } from "./motor-precio";
import type {
  CategoriaCharola,
  ComplejidadLed,
  FuenteElectrificacion,
} from "./motor-electrificacion";
import { compararFolios, type ReciboResumen } from "./recibos-db";

export interface CharolaGuardada {
  numero: number;
  drivers: number;
  categoria: CategoriaCharola;
}

export interface RenglonElectrificacionGuardado {
  numero: number;
  modelo: string;
  cantidad: number;
  metrosLed: number;
  complejidadLed: ComplejidadLed | "";
  charolas: CharolaGuardada[];
  nota: string;
  puSugerido: number | null;
  fuente: FuenteElectrificacion;
  banda: Banda;
  propuesto: number;
  aceptado: number;
  importe: number;
  justificacion: string;
  pendienteRevision: boolean;
}

export interface ReciboElectrificacionGuardado {
  folio: string;
  fecha: string;
  contratista: string;
  obra: string;
  ot: string;
  prioridad: string;
  motivo: string;
  guardadoEn: string;
  renglones: RenglonElectrificacionGuardado[];
}

// Payload que espera guardar_recibo_electrificacion para cada renglón (jsonb).
export interface RenglonElectrificacionParaGuardar {
  modelo: string;
  cantidad: number;
  metrosLed: number;
  complejidadLed: ComplejidadLed | "";
  charolas: { drivers: number }[];
  puSugerido: number | null;
  fuente: FuenteElectrificacion;
  propuesto: number;
  aceptado: number;
  banda: Banda;
  justificacion: string;
  nota: string;
}

export async function guardarReciboElectrificacionEnDb(
  supabase: SupabaseClient,
  recibo: {
    folio: string;
    fechaRecibo: string;
    contratista: string;
    obra: string;
    ot: string;
    prioridad: string;
    motivoPrioridad: string;
  },
  renglones: RenglonElectrificacionParaGuardar[]
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("guardar_recibo_electrificacion", {
    p_folio: recibo.folio,
    p_fecha_recibo: recibo.fechaRecibo,
    p_contratista: recibo.contratista,
    p_obra: recibo.obra || null,
    p_ot: recibo.ot || null,
    p_prioridad: recibo.prioridad,
    p_motivo_prioridad: recibo.motivoPrioridad || null,
    p_renglones: renglones,
  });
  if (error) return { id: null, error: error.message };
  return { id: data as string, error: null };
}

export interface FolioElectrificacionExistente {
  folio: string;
  fecha: string;
  obra: string;
  ot: string;
  numRenglones: number;
}

// Folios ya guardados, para ofrecer "Continuar este folio" en la captura.
export async function listarFoliosElectrificacion(
  supabase: SupabaseClient
): Promise<FolioElectrificacionExistente[]> {
  const { data, error } = await supabase
    .from("recibos_electrificacion")
    .select("folio, fecha_recibo, obra, ot, renglones_electrificacion(count)")
    .returns<
      {
        folio: string;
        fecha_recibo: string;
        obra: string | null;
        ot: string | null;
        renglones_electrificacion: { count: number }[];
      }[]
    >();
  if (error || !data) return [];
  return data.map((r) => ({
    folio: r.folio,
    fecha: r.fecha_recibo,
    obra: r.obra ?? "",
    ot: r.ot ?? "",
    numRenglones: r.renglones_electrificacion[0]?.count ?? 0,
  }));
}

interface RenglonDbRow {
  numero: number;
  modelo: string;
  cantidad: number;
  metros_led: number;
  complejidad_led: ComplejidadLed | null;
  nota: string | null;
  pu_sugerido: number | null;
  fuente_sugerido: FuenteElectrificacion;
  banda: Banda;
  pu_propuesto: number;
  pu_aceptado: number;
  importe: number;
  justificacion: string | null;
  charolas_electrificacion: { numero: number; drivers: number; categoria: CategoriaCharola }[];
}

interface ReciboDbRow {
  folio: string;
  fecha_recibo: string;
  contratista: string;
  obra: string | null;
  ot: string | null;
  prioridad: string;
  motivo_prioridad: string | null;
  creado_en: string;
  renglones_electrificacion: RenglonDbRow[];
}

export async function buscarReciboElectrificacionPorFolio(
  supabase: SupabaseClient,
  folio: string
): Promise<ReciboElectrificacionGuardado | null> {
  const { data, error } = await supabase
    .from("recibos_electrificacion")
    .select(
      "folio, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, creado_en, " +
        "renglones_electrificacion(numero, modelo, cantidad, metros_led, complejidad_led, nota, pu_sugerido, " +
        "fuente_sugerido, banda, pu_propuesto, pu_aceptado, importe, justificacion, " +
        "charolas_electrificacion(numero, drivers, categoria))"
    )
    .eq("folio", folio)
    .maybeSingle()
    .returns<ReciboDbRow | null>();

  if (error || !data) return null;

  return {
    folio: data.folio,
    fecha: data.fecha_recibo,
    contratista: data.contratista,
    obra: data.obra ?? "",
    ot: data.ot ?? "",
    prioridad: data.prioridad,
    motivo: data.motivo_prioridad ?? "",
    guardadoEn: data.creado_en,
    renglones: [...data.renglones_electrificacion]
      .sort((a, b) => a.numero - b.numero)
      .map((r) => ({
        numero: r.numero,
        modelo: r.modelo,
        cantidad: Number(r.cantidad),
        metrosLed: Number(r.metros_led),
        complejidadLed: r.complejidad_led ?? "",
        charolas: [...r.charolas_electrificacion].sort((a, b) => a.numero - b.numero),
        nota: r.nota ?? "",
        puSugerido: r.pu_sugerido == null ? null : Number(r.pu_sugerido),
        fuente: r.fuente_sugerido,
        banda: r.banda,
        propuesto: Number(r.pu_propuesto),
        aceptado: Number(r.pu_aceptado),
        importe: Number(r.importe),
        justificacion: r.justificacion ?? "",
        pendienteRevision: Number(r.pu_aceptado) === 0 && Number(r.pu_propuesto) > 0,
      })),
  };
}

export type ReciboResumenElectrificacion = Omit<ReciboResumen, "tipo"> & {
  tipo: "electrificacion";
};

export async function listarRecibosElectrificacion(
  supabase: SupabaseClient
): Promise<ReciboResumenElectrificacion[]> {
  const { data, error } = await supabase
    .from("recibos_electrificacion")
    .select(
      "folio, fecha_recibo, contratista, obra, ot, prioridad, creado_en, " +
        "renglones_electrificacion(cantidad, pu_propuesto, pu_aceptado)"
    )
    .returns<
      {
        folio: string;
        fecha_recibo: string;
        contratista: string;
        obra: string | null;
        ot: string | null;
        prioridad: string;
        creado_en: string;
        renglones_electrificacion: { cantidad: number; pu_propuesto: number; pu_aceptado: number }[];
      }[]
    >();

  if (error || !data) return [];

  return data
    .map((r) => {
      const rs = r.renglones_electrificacion;
      return {
        tipo: "electrificacion" as const,
        folio: r.folio,
        fecha: r.fecha_recibo,
        contratista: r.contratista,
        obra: r.obra ?? "",
        ot: r.ot ?? "",
        prioridad: r.prioridad,
        guardadoEn: r.creado_en,
        numRenglones: rs.length,
        numPendientes: rs.filter((x) => Number(x.pu_aceptado) === 0 && Number(x.pu_propuesto) > 0)
          .length,
        totalPropuesto: rs.reduce((s, x) => s + Number(x.cantidad) * Number(x.pu_propuesto), 0),
        totalAceptado: rs.reduce((s, x) => s + Number(x.cantidad) * Number(x.pu_aceptado), 0),
      };
    })
    .sort((a, b) => compararFolios(a.folio, b.folio));
}
