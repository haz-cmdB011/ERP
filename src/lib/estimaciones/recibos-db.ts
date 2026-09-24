// Lectura/escritura de recibos de Acabados contra Supabase
// (tablas `recibos`/`renglones`, RPC `guardar_recibo_acabados` — ver
// supabase/migrations/20260922145337_estimaciones_acabados.sql). Reemplaza
// el prototipo que guardaba en localStorage: ahora el registro es real y
// compartido entre quienes tengan acceso al área.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RenglonHistorico } from "./datos-acabados";
import type { Banda, Fuente } from "./motor-precio";

export interface RenglonGuardado {
  numero: number;
  modelo: string;
  familia: string;
  tamano: string;
  cantidad: number;
  acabado: string;
  acabado2: string;
  tipoTrabajo: "produccion" | "reproceso";
  causa: string;
  fases: string[];
  nota: string;
  puSugerido: number | null;
  fuente: Fuente;
  banda: Banda;
  propuesto: number;
  aceptado: number;
  importe: number;
  justificacion: string;
  pendienteRevision: boolean;
}

export interface ReciboGuardado {
  folio: string;
  fecha: string;
  contratista: string;
  obra: string;
  ot: string;
  prioridad: string;
  motivo: string;
  guardadoEn: string;
  renglones: RenglonGuardado[];
}

// Payload que espera guardar_recibo_acabados para cada renglón (jsonb).
export interface RenglonParaGuardar {
  modelo: string;
  familia: string;
  acabado: string;
  acabado2: string;
  tipoTrabajo: "produccion" | "reproceso";
  causa: string;
  cantidad: number;
  tamano: string;
  fases: string[];
  puSugerido: number | null;
  fuente: Fuente;
  sinTamano: boolean;
  propuesto: number;
  aceptado: number;
  banda: Banda;
  justificacion: string;
  nota: string;
}

export async function guardarReciboEnDb(
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
  renglones: RenglonParaGuardar[]
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("guardar_recibo_acabados", {
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

interface RenglonConRecibo {
  modelo: string;
  familia: string;
  acabado: string | null;
  acabado_2: string | null;
  cantidad: number;
  pu_propuesto: number;
  pu_aceptado: number;
  recibos: { folio: string; fecha_recibo: string; obra: string | null; ot: string | null } | null;
}

// Todo el histórico de renglones ya guardados en Supabase, en la forma que
// espera el motor (motor-precio.ts ya filtra por aceptado > 0 donde
// corresponde, así que aquí se manda todo). Se vuelve a pedir después de
// cada guardado para que un recibo recién guardado sirva de precedente al
// siguiente renglón capturado.
export async function cargarHistoricoDb(supabase: SupabaseClient): Promise<RenglonHistorico[]> {
  const { data, error } = await supabase
    .from("renglones")
    .select(
      "modelo, familia, acabado, acabado_2, cantidad, pu_propuesto, pu_aceptado, recibos!inner(folio, fecha_recibo, obra, ot)"
    )
    .order("creado_en", { ascending: false })
    .limit(3000)
    .returns<RenglonConRecibo[]>();

  if (error || !data) return [];

  return data
    .filter((r) => r.recibos)
    .map((r) => ({
      modelo: r.modelo,
      familia: r.familia,
      acabado: r.acabado ?? "",
      acabado2: r.acabado_2 ?? "",
      cantidad: Number(r.cantidad),
      propuesto: Number(r.pu_propuesto),
      aceptado: Number(r.pu_aceptado),
      fecha: r.recibos!.fecha_recibo,
      folio: r.recibos!.folio,
      obra: r.recibos!.obra ?? "",
      ot: r.recibos!.ot ?? "",
    }));
}

interface RenglonDbRow {
  numero: number;
  modelo: string;
  familia: string;
  tamano: string | null;
  cantidad: number;
  acabado: string | null;
  acabado_2: string | null;
  tipo_trabajo: "produccion" | "reproceso";
  causa_reproceso: string | null;
  fases: string[];
  nota: string | null;
  pu_sugerido: number | null;
  fuente_sugerido: Fuente;
  banda: Banda;
  pu_propuesto: number;
  pu_aceptado: number;
  importe: number;
  justificacion: string | null;
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
  renglones: RenglonDbRow[];
}

// Un renglón queda "pendiente de revisión" cuando lo capturó alguien sin
// permiso para ver el precio sugerido: su banda se calculó igual (para no
// perder la señal), pero el precio aceptado sigue en 0 hasta que el
// desarrollador o el admin del área lo revisen.
function esPendienteRevision(r: RenglonDbRow): boolean {
  return Number(r.pu_aceptado) === 0 && Number(r.pu_propuesto) > 0;
}

export async function buscarReciboPorFolio(
  supabase: SupabaseClient,
  folio: string
): Promise<ReciboGuardado | null> {
  const { data, error } = await supabase
    .from("recibos")
    .select(
      "folio, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, creado_en, " +
        "renglones(numero, modelo, familia, tamano, cantidad, acabado, acabado_2, tipo_trabajo, " +
        "causa_reproceso, fases, nota, pu_sugerido, fuente_sugerido, banda, pu_propuesto, pu_aceptado, importe, justificacion)"
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
    renglones: [...data.renglones]
      .sort((a, b) => a.numero - b.numero)
      .map((r) => ({
        numero: r.numero,
        modelo: r.modelo,
        familia: r.familia,
        tamano: r.tamano ?? "",
        cantidad: Number(r.cantidad),
        acabado: r.acabado ?? "",
        acabado2: r.acabado_2 ?? "",
        tipoTrabajo: r.tipo_trabajo,
        causa: r.causa_reproceso ?? "",
        fases: r.fases ?? [],
        nota: r.nota ?? "",
        puSugerido: r.pu_sugerido == null ? null : Number(r.pu_sugerido),
        fuente: r.fuente_sugerido,
        banda: r.banda,
        propuesto: Number(r.pu_propuesto),
        aceptado: Number(r.pu_aceptado),
        importe: Number(r.importe),
        justificacion: r.justificacion ?? "",
        pendienteRevision: esPendienteRevision(r),
      })),
  };
}

export interface ReciboResumen {
  folio: string;
  fecha: string;
  contratista: string;
  obra: string;
  ot: string;
  prioridad: string;
  guardadoEn: string;
  numRenglones: number;
  numPendientes: number;
  totalPropuesto: number;
  totalAceptado: number;
}

// Folios numéricos ordenan como número (1677 antes que 9001); los que
// llevan letras o guiones (p. ej. "099-26") quedan después, alfabéticos.
export function compararFolios(a: string, b: string): number {
  const na = /^\d+$/.test(a) ? Number(a) : null;
  const nb = /^\d+$/.test(b) ? Number(b) : null;
  if (na != null && nb != null) return na - nb;
  if (na != null) return -1;
  if (nb != null) return 1;
  return a.localeCompare(b, "es");
}

export async function listarRecibos(supabase: SupabaseClient): Promise<ReciboResumen[]> {
  const { data, error } = await supabase
    .from("recibos")
    .select(
      "folio, fecha_recibo, contratista, obra, ot, prioridad, creado_en, " +
        "renglones(cantidad, pu_propuesto, pu_aceptado)"
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
        renglones: { cantidad: number; pu_propuesto: number; pu_aceptado: number }[];
      }[]
    >();

  if (error || !data) return [];

  const resumenes = data.map((r) => {
    const totalPropuesto = r.renglones.reduce((s, x) => s + Number(x.cantidad) * Number(x.pu_propuesto), 0);
    const totalAceptado = r.renglones.reduce((s, x) => s + Number(x.cantidad) * Number(x.pu_aceptado), 0);
    const numPendientes = r.renglones.filter(
      (x) => Number(x.pu_aceptado) === 0 && Number(x.pu_propuesto) > 0
    ).length;
    return {
      folio: r.folio,
      fecha: r.fecha_recibo,
      contratista: r.contratista,
      obra: r.obra ?? "",
      ot: r.ot ?? "",
      prioridad: r.prioridad,
      guardadoEn: r.creado_en,
      numRenglones: r.renglones.length,
      numPendientes,
      totalPropuesto,
      totalAceptado,
    };
  });

  return resumenes.sort((a, b) => compararFolios(a.folio, b.folio));
}
