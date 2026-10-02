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
  // Descripción del padre del PM elegido (la variante del modelo).
  descripcionPm: string | null;
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
  // Variante del modelo (ver RenglonParaGuardar en recibos-db.ts).
  descripcionPm: string | null;
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

// OT de Planeación con muebles con iluminación (todos sus PM vigentes). El
// generador solo deja elegir estas. `ot` es la clave ("193-24"), que es lo
// que se guarda en el recibo.
export interface OtElectrificacion {
  ot: string;
  // El proyecto más frecuente entre sus PM.
  proyecto: string | null;
  numPms: number;
  numModelos: number;
  piezas: number;
}

// Variante (código + descripción) con iluminación de una OT: lo que declararon
// todos sus PM (suma de esos muebles) y lo ya registrado en otros recibos no
// cancelados.
export interface ModeloOtElectrificacion {
  modelo: string;
  cantidadPm: number;
  cantidadRegistrada: number;
  // En qué PM de la OT viene ("2PM193-24, 7PM193-24").
  pms: string;
  // Primera línea de la descripción, para reconocerla en la lista.
  descripcion: string | null;
  // Descripción completa: es lo que guarda el renglón.
  descripcionPm: string;
  // Cuántas variantes tiene ese código en la OT.
  variantes: number;
}

// Todas las OT con iluminación (el personal de Estimaciones y el maquilador las
// ven vía una función security definer; nunca precios ni datos de cliente).
// null si la consulta falla.
export async function listarOtsElectrificacion(
  supabase: SupabaseClient
): Promise<OtElectrificacion[] | null> {
  const { data, error } = await supabase.rpc("listar_ots_electrificacion");
  if (error || !data) return null;
  return (
    data as {
      orden_trabajo: string;
      proyecto: string | null;
      num_pms: number;
      num_modelos: number;
      piezas: number;
    }[]
  ).map((r) => ({
    ot: r.orden_trabajo,
    proyecto: r.proyecto,
    numPms: Number(r.num_pms),
    numModelos: Number(r.num_modelos),
    piezas: Number(r.piezas),
  }));
}

// excluirReciboId: al modificar un recibo, para no contar sus propios renglones
// como "ya registrados".
export async function listarModelosOtElectrificacion(
  supabase: SupabaseClient,
  ot: string,
  excluirReciboId?: string
): Promise<ModeloOtElectrificacion[] | null> {
  const { data, error } = await supabase.rpc("listar_modelos_ot_electrificacion", {
    p_ot: ot,
    p_excluir_recibo: excluirReciboId ?? null,
  });
  if (error || !data) return null;
  return (
    data as {
      modelo: string;
      cantidad_pm: number;
      cantidad_registrada: number;
      pms: string | null;
      descripcion: string | null;
      descripcion_pm: string | null;
      variantes: number;
    }[]
  ).map((r) => ({
    modelo: r.modelo,
    cantidadPm: Number(r.cantidad_pm),
    cantidadRegistrada: Number(r.cantidad_registrada),
    pms: r.pms ?? "",
    descripcion: r.descripcion || null,
    descripcionPm: r.descripcion_pm ?? "",
    variantes: Number(r.variantes) || 1,
  }));
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
  descripcion_pm: string | null;
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
        "renglones_electrificacion(id, numero, modelo, descripcion_pm, cantidad, metros_led, complejidad_led, nota, pu_sugerido, " +
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
        descripcionPm: r.descripcion_pm,
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

// Precio pagado de un renglón de Electrificación: los precedentes del precio
// sugerido (ver precedenteElectrificacion en motor-electrificacion.ts).
export interface PrecioPagadoElectrificacion {
  modelo: string;
  descripcionPm: string | null;
  cantidad: number;
  aceptado: number;
  fecha: string;
  folio: string;
  ot: string;
}

// Renglones de recibos de Electrificación PAGADOS con precio aceptado (los
// únicos que sirven de precedente). Al maquilador RLS solo le devuelve los
// suyos, y de todos modos no ve el sugerido.
export async function cargarPreciosPagadosElectrificacion(
  supabase: SupabaseClient
): Promise<PrecioPagadoElectrificacion[]> {
  const { data, error } = await supabase
    .from("renglones_electrificacion")
    .select(
      "modelo, descripcion_pm, cantidad, pu_aceptado, recibos_electrificacion!inner(folio, fecha_recibo, ot, estado)"
    )
    .eq("recibos_electrificacion.estado", "pagado")
    .gt("pu_aceptado", 0)
    .order("creado_en", { ascending: false })
    .limit(3000)
    .returns<
      {
        modelo: string;
        descripcion_pm: string | null;
        cantidad: number;
        pu_aceptado: number;
        recibos_electrificacion: { folio: string; fecha_recibo: string; ot: string | null } | null;
      }[]
    >();
  if (error || !data) return [];
  return data
    .filter((r) => r.recibos_electrificacion)
    .map((r) => ({
      modelo: r.modelo,
      descripcionPm: r.descripcion_pm,
      cantidad: Number(r.cantidad),
      aceptado: Number(r.pu_aceptado),
      fecha: r.recibos_electrificacion!.fecha_recibo,
      folio: r.recibos_electrificacion!.folio,
      ot: r.recibos_electrificacion!.ot ?? "",
    }));
}
