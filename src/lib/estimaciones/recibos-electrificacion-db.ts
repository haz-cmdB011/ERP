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
import {
  compararFolios,
  elegirVigente,
  type DecisionRenglon,
  type EstadoRecibo,
  type ReciboResumen,
} from "./recibos-db";

export interface CharolaGuardada {
  numero: number;
  drivers: number;
  categoria: CategoriaCharola;
}

export interface RenglonElectrificacionGuardado {
  id?: string;
  numero: number;
  modelo: string;
  cantidad: number;
  metrosLed: number;
  complejidadLed: ComplejidadLed | "";
  charolas: CharolaGuardada[];
  nota: string;
  puSugerido: number | null;
  fuente: FuenteElectrificacion;
  banda: Banda | null;
  propuesto: number;
  aceptado: number;
  importe: number;
  justificacion: string;
  pendienteRevision: boolean;
  decision?: DecisionRenglon;
}

export interface ReciboElectrificacionGuardado {
  id?: string;
  estado?: EstadoRecibo;
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
  // Si el modelo no está en el PM de la OT, o la cantidad acumulada del modelo
  // no cuadra con lo declarado, la base exige motivo.
  motivoDescuadre: string;
}

// OT (pedido) subida a Planeación. El generador solo deja elegir estas.
export interface OtPm {
  pedidoId: string;
  numeroPedido: string;
  proyecto: string | null;
  numModelos: number;
  piezas: number;
}

// Modelo de una OT con lo que Planeación declaró (suma de todas sus filas del
// PM) y lo ya registrado en otros recibos no cancelados.
export interface ModeloPm {
  modelo: string;
  cantidadPm: number;
  cantidadRegistrada: number;
}

// Todas las OT del PM (el personal de Estimaciones y el maquilador las ven vía
// una función security definer; nunca precios ni datos de cliente). null si la
// consulta falla.
export async function listarOtsPm(supabase: SupabaseClient): Promise<OtPm[] | null> {
  const { data, error } = await supabase.rpc("listar_ots_pm_electrificacion");
  if (error || !data) return null;
  return (
    data as {
      pedido_id: string;
      numero_pedido: string;
      proyecto: string | null;
      num_modelos: number;
      piezas: number;
    }[]
  ).map((r) => ({
    pedidoId: r.pedido_id,
    numeroPedido: r.numero_pedido,
    proyecto: r.proyecto,
    numModelos: Number(r.num_modelos),
    piezas: Number(r.piezas),
  }));
}

// excluirReciboId: al modificar un recibo, para no contar sus propios renglones
// como "ya registrados".
export async function listarModelosPm(
  supabase: SupabaseClient,
  pedidoId: string,
  excluirReciboId?: string
): Promise<ModeloPm[] | null> {
  const { data, error } = await supabase.rpc("listar_modelos_pm_electrificacion", {
    p_pedido: pedidoId,
    p_excluir_recibo: excluirReciboId ?? null,
  });
  if (error || !data) return null;
  return (
    data as { modelo: string; cantidad_pm: number; cantidad_registrada: number }[]
  ).map((r) => ({
    modelo: r.modelo,
    cantidadPm: Number(r.cantidad_pm),
    cantidadRegistrada: Number(r.cantidad_registrada),
  }));
}

export type EstadoDiscrepancia = "pendiente" | "aceptada" | "rechazada";

export interface DiscrepanciaRecibo {
  id: string;
  modelo: string;
  cantidadCapturada: number;
  cantidadAcumulada: number | null;
  cantidadPm: number | null;
  motivo: string;
  estado: EstadoDiscrepancia;
  notaResolucion: string | null;
}

// Discrepancias de un recibo con su estado (RLS: las ve quien decide y quien
// capturó el recibo).
export async function listarDiscrepanciasRecibo(
  supabase: SupabaseClient,
  reciboId: string
): Promise<DiscrepanciaRecibo[]> {
  const { data, error } = await supabase
    .from("discrepancias_electrificacion")
    .select(
      "id, modelo, cantidad_capturada, cantidad_acumulada, cantidad_pm, motivo, estado, nota_resolucion"
    )
    .eq("recibo_id", reciboId)
    .order("creado_en", { ascending: true })
    .returns<
      {
        id: string;
        modelo: string;
        cantidad_capturada: number;
        cantidad_acumulada: number | null;
        cantidad_pm: number | null;
        motivo: string;
        estado: EstadoDiscrepancia;
        nota_resolucion: string | null;
      }[]
    >();
  if (error || !data) return [];
  return data.map((d) => ({
    id: d.id,
    modelo: d.modelo,
    cantidadCapturada: Number(d.cantidad_capturada),
    cantidadAcumulada: d.cantidad_acumulada == null ? null : Number(d.cantidad_acumulada),
    cantidadPm: d.cantidad_pm == null ? null : Number(d.cantidad_pm),
    motivo: d.motivo,
    estado: d.estado,
    notaResolucion: d.nota_resolucion,
  }));
}

export async function decidirDiscrepanciaElectrificacion(
  supabase: SupabaseClient,
  id: string,
  decision: "aceptada" | "rechazada",
  nota: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("decidir_discrepancia_electrificacion", {
    p_id: id,
    p_decision: decision,
    p_nota: nota,
  });
  return { error: error?.message ?? null };
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

// Reemplaza los renglones de un recibo de Electrificación pendiente (mismo
// candado que modificarReciboEnDb: solo mientras nadie de Estimaciones haya
// decidido ningún renglón).
export async function modificarReciboElectrificacionEnDb(
  supabase: SupabaseClient,
  reciboId: string,
  recibo: {
    fechaRecibo: string;
    obra: string;
    ot: string;
    prioridad: string;
    motivoPrioridad: string;
  },
  renglones: RenglonElectrificacionParaGuardar[]
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("modificar_recibo_electrificacion", {
    p_recibo_id: reciboId,
    p_fecha_recibo: recibo.fechaRecibo,
    p_obra: recibo.obra || null,
    p_ot: recibo.ot || null,
    p_prioridad: recibo.prioridad,
    p_motivo_prioridad: recibo.motivoPrioridad || null,
    p_renglones: renglones,
  });
  return { error: error?.message ?? null };
}

export interface FolioElectrificacionExistente {
  folio: string;
  fecha: string;
  obra: string;
  ot: string;
  numRenglones: number;
}

// Folios vigentes, para ofrecer "Continuar este folio" en la captura (al
// maquilador, RLS solo le devuelve los suyos).
export async function listarFoliosElectrificacion(
  supabase: SupabaseClient
): Promise<FolioElectrificacionExistente[]> {
  const { data, error } = await supabase
    .from("recibos_electrificacion")
    .select("folio, fecha_recibo, obra, ot, renglones_electrificacion(count)")
    .neq("estado", "cancelado")
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
  id: string;
  numero: number;
  modelo: string;
  cantidad: number;
  metros_led: number;
  complejidad_led: ComplejidadLed | null;
  nota: string | null;
  pu_sugerido: number | null;
  fuente_sugerido: FuenteElectrificacion;
  banda: Banda | null;
  pu_propuesto: number;
  pu_aceptado: number;
  importe: number;
  justificacion: string | null;
  decision: DecisionRenglon;
  charolas_electrificacion: { numero: number; drivers: number; categoria: CategoriaCharola }[];
}

interface ReciboDbRow {
  id: string;
  estado: EstadoRecibo;
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
  const { data: filas, error } = await supabase
    .from("recibos_electrificacion")
    .select(
      "id, estado, folio, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, creado_en, " +
        "renglones_electrificacion(id, numero, modelo, cantidad, metros_led, complejidad_led, nota, pu_sugerido, " +
        "fuente_sugerido, banda, pu_propuesto, pu_aceptado, importe, justificacion, decision, " +
        "charolas_electrificacion(numero, drivers, categoria))"
    )
    .eq("folio", folio)
    .order("creado_en", { ascending: false })
    .returns<ReciboDbRow[]>();

  const data = error || !filas ? null : elegirVigente(filas);
  if (!data) return null;

  return {
    id: data.id,
    estado: data.estado,
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
        id: r.id,
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
        pendienteRevision: r.decision == null,
        decision: r.decision,
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
      "id, estado, folio, fecha_recibo, contratista, obra, ot, prioridad, creado_en, " +
        "renglones_electrificacion(cantidad, pu_propuesto, pu_aceptado, decision)"
    )
    .returns<
      {
        id: string;
        estado: EstadoRecibo;
        folio: string;
        fecha_recibo: string;
        contratista: string;
        obra: string | null;
        ot: string | null;
        prioridad: string;
        creado_en: string;
        renglones_electrificacion: {
          cantidad: number;
          pu_propuesto: number;
          pu_aceptado: number;
          decision: DecisionRenglon;
        }[];
      }[]
    >();

  if (error || !data) return [];

  return data
    .map((r) => {
      const rs = r.renglones_electrificacion;
      return {
        id: r.id,
        estado: r.estado,
        tipo: "electrificacion" as const,
        folio: r.folio,
        fecha: r.fecha_recibo,
        contratista: r.contratista,
        obra: r.obra ?? "",
        ot: r.ot ?? "",
        prioridad: r.prioridad,
        guardadoEn: r.creado_en,
        numRenglones: rs.length,
        numPendientes: rs.filter((x) => x.decision == null).length,
        totalPropuesto: rs.reduce((s, x) => s + Number(x.cantidad) * Number(x.pu_propuesto), 0),
        totalAceptado: rs.reduce((s, x) => s + Number(x.cantidad) * Number(x.pu_aceptado), 0),
      };
    })
    .sort((a, b) => compararFolios(a.folio, b.folio));
}
