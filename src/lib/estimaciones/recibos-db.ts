// Lectura/escritura de recibos de Acabados contra Supabase
// (tablas `recibos`/`renglones`, RPC `guardar_recibo_acabados` — ver
// supabase/migrations/20260922145337_estimaciones_acabados.sql). Reemplaza
// el prototipo que guardaba en localStorage: ahora el registro es real y
// compartido entre quienes tengan acceso al área.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RenglonHistorico } from "./datos-acabados";
import { HERRAJES_NO, HERRAJES_SI, type Banda, type Fuente } from "./motor-precio";

// Tipo de recibo: comparten tablas (recibos/renglones) y motor de precio.
export type TipoRecibo = "acabados" | "armado";

export const NOMBRE_TIPO_RECIBO: Record<TipoRecibo, string> = {
  acabados: "Acabados",
  armado: "Armado",
};

// Ciclo de vida del recibo (común a todos los tipos, Electrificación
// incluida): al maquilador no se le paga hasta que está 'revisado'.
export type EstadoRecibo = "pendiente" | "revisado" | "pagado" | "cancelado";

export const ESTADO_NOMBRE: Record<EstadoRecibo, string> = {
  pendiente: "Pendiente de revisión",
  revisado: "Revisado · por pagar",
  pagado: "Pagado",
  cancelado: "Cancelado",
};

// Decisión del revisor sobre un renglón; null = todavía sin revisar.
export type DecisionRenglon = "aceptado" | "modificado" | null;

export interface RenglonGuardado {
  // Solo en renglones leídos de la base (lo usa la pantalla de revisión).
  id?: string;
  numero: number;
  modelo: string;
  familia: string;
  tamano: string;
  cantidad: number;
  acabado: string;
  acabado2: string;
  // Solo en recibos de Armado.
  tipoArmado?: string;
  colocacionHerrajes?: boolean;
  tipoTrabajo: "produccion" | "reproceso";
  causa: string;
  fases: string[];
  nota: string;
  puSugerido: number | null;
  fuente: Fuente;
  // null en renglones del maquilador que nadie ha revisado todavía.
  banda: Banda | null;
  propuesto: number;
  aceptado: number;
  importe: number;
  justificacion: string;
  pendienteRevision: boolean;
  decision?: DecisionRenglon;
}

export interface ReciboGuardado {
  // id y estado solo vienen cuando el recibo se lee de la base.
  id?: string;
  estado?: EstadoRecibo;
  tipo: TipoRecibo;
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
  // Solo en recibos de Armado.
  tipoArmado?: string;
  colocacionHerrajes?: boolean;
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
  renglones: RenglonParaGuardar[],
  tipo: TipoRecibo = "acabados"
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc(`guardar_recibo_${tipo}`, {
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
  tipo_armado: string | null;
  colocacion_herrajes: boolean | null;
  cantidad: number;
  pu_propuesto: number;
  pu_aceptado: number;
  recibos: {
    folio: string;
    fecha_recibo: string;
    obra: string | null;
    ot: string | null;
    tipo: TipoRecibo;
  } | null;
}

// Todo el histórico de renglones ya guardados en Supabase, en la forma que
// espera el motor (motor-precio.ts ya filtra por aceptado > 0 donde
// corresponde, así que aquí se manda todo). Se vuelve a pedir después de
// cada guardado para que un recibo recién guardado sirva de precedente al
// siguiente renglón capturado.
export async function cargarHistoricoDb(
  supabase: SupabaseClient,
  tipo: TipoRecibo = "acabados"
): Promise<RenglonHistorico[]> {
  // Cada tipo de recibo tiene su propio histórico: el precio de un armado no
  // sirve de precedente para un acabado ni al revés.
  const { data, error } = await supabase
    .from("renglones")
    .select(
      "modelo, familia, acabado, acabado_2, tipo_armado, colocacion_herrajes, cantidad, pu_propuesto, pu_aceptado, recibos!inner(folio, fecha_recibo, obra, ot, tipo, estado)"
    )
    .eq("recibos.tipo", tipo)
    .neq("recibos.estado", "cancelado")
    .order("creado_en", { ascending: false })
    .limit(3000)
    .returns<RenglonConRecibo[]>();

  if (error || !data) return [];

  return data
    .filter((r) => r.recibos)
    .map((r) => ({
      modelo: r.modelo,
      familia: r.familia,
      // En Armado el tipo de armado viaja en el campo `acabado` (ver motor).
      acabado: (tipo === "armado" ? r.tipo_armado : r.acabado) ?? "",
      // En Armado, la colocación de herrajes viaja como "Sí" / "No" en `acabado2`.
      acabado2: tipo === "armado" ? (r.colocacion_herrajes ? HERRAJES_SI : HERRAJES_NO) : (r.acabado_2 ?? ""),
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
  id: string;
  numero: number;
  modelo: string;
  familia: string;
  tamano: string | null;
  cantidad: number;
  acabado: string | null;
  acabado_2: string | null;
  tipo_armado: string | null;
  colocacion_herrajes: boolean | null;
  tipo_trabajo: "produccion" | "reproceso";
  causa_reproceso: string | null;
  fases: string[];
  nota: string | null;
  pu_sugerido: number | null;
  fuente_sugerido: Fuente;
  banda: Banda | null;
  pu_propuesto: number;
  pu_aceptado: number;
  importe: number;
  justificacion: string | null;
  decision: DecisionRenglon;
}

interface ReciboDbRow {
  id: string;
  estado: EstadoRecibo;
  tipo: TipoRecibo;
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

// Un renglón queda "pendiente de revisión" mientras nadie de Estimaciones
// haya aceptado o modificado su precio (típicamente, lo capturó el
// maquilador). Su precio aceptado sigue en 0 hasta entonces.
function esPendienteRevision(r: { decision: DecisionRenglon }): boolean {
  return r.decision == null;
}

// Un folio cancelado deja de ocupar su folio, así que puede haber varios
// recibos con el mismo: se muestra el vigente y, si no hay, el cancelado
// más reciente.
export function elegirVigente<T extends { estado: EstadoRecibo }>(filas: T[]): T | null {
  return filas.find((f) => f.estado !== "cancelado") ?? filas[0] ?? null;
}

export async function buscarReciboPorFolio(
  supabase: SupabaseClient,
  folio: string,
  tipo: TipoRecibo = "acabados"
): Promise<ReciboGuardado | null> {
  const { data: filas, error } = await supabase
    .from("recibos")
    .select(
      "id, estado, tipo, folio, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, creado_en, " +
        "renglones(id, numero, modelo, familia, tamano, cantidad, acabado, acabado_2, tipo_armado, colocacion_herrajes, tipo_trabajo, " +
        "causa_reproceso, fases, nota, pu_sugerido, fuente_sugerido, banda, pu_propuesto, pu_aceptado, importe, justificacion, decision)"
    )
    .eq("folio", folio)
    .eq("tipo", tipo)
    .order("creado_en", { ascending: false })
    .returns<ReciboDbRow[]>();

  const data = error || !filas ? null : elegirVigente(filas);
  if (!data) return null;

  return {
    id: data.id,
    estado: data.estado,
    tipo: data.tipo,
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
        id: r.id,
        numero: r.numero,
        modelo: r.modelo,
        familia: r.familia,
        tamano: r.tamano ?? "",
        cantidad: Number(r.cantidad),
        acabado: r.acabado ?? "",
        acabado2: r.acabado_2 ?? "",
        tipoArmado: r.tipo_armado ?? undefined,
        colocacionHerrajes: r.tipo_armado ? (r.colocacion_herrajes ?? false) : undefined,
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
        decision: r.decision,
      })),
  };
}

export interface ReciboResumen {
  id: string;
  estado: EstadoRecibo;
  tipo: TipoRecibo;
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
      "id, estado, tipo, folio, fecha_recibo, contratista, obra, ot, prioridad, creado_en, " +
        "renglones(cantidad, pu_propuesto, pu_aceptado, decision)"
    )
    .returns<
      {
        id: string;
        estado: EstadoRecibo;
        tipo: TipoRecibo;
        folio: string;
        fecha_recibo: string;
        contratista: string;
        obra: string | null;
        ot: string | null;
        prioridad: string;
        creado_en: string;
        renglones: {
          cantidad: number;
          pu_propuesto: number;
          pu_aceptado: number;
          decision: DecisionRenglon;
        }[];
      }[]
    >();

  if (error || !data) return [];

  const resumenes = data.map((r) => {
    const totalPropuesto = r.renglones.reduce((s, x) => s + Number(x.cantidad) * Number(x.pu_propuesto), 0);
    const totalAceptado = r.renglones.reduce((s, x) => s + Number(x.cantidad) * Number(x.pu_aceptado), 0);
    const numPendientes = r.renglones.filter(esPendienteRevision).length;
    return {
      id: r.id,
      estado: r.estado,
      tipo: r.tipo,
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
