// Informe de no conformidad: el detalle que lleva un informe "No aprobado"
// (formato "Producto no conforme" de Calidad). Lo guarda guardar_no_conformidad
// (migración no_conformidades_calidad). Motivos, áreas con responsables y
// autorizadores vienen del catálogo M-R-A (tablas motivos_calidad, areas_calidad
// y autorizadores_calidad).

import type { Proceso } from "@/lib/produccion/asignaciones";

// Tipos de reporte del formato vigente de Calidad (aún puede cambiar).
export const TIPOS_REPORTE = ["Incidencia", "Desviación", "Producto No Conforme", "Mejora de Producto"] as const;
// Un rechazo de Calidad es, por defecto, un producto no conforme.
export const TIPO_REPORTE_POR_DEFECTO = "Producto No Conforme";

export const SEVERIDADES = [
  { valor: "baja", nombre: "Baja" },
  { valor: "media", nombre: "Media" },
  { valor: "alta", nombre: "Alta" },
] as const;

// Causas de fondo, tomadas del catálogo anterior de Calidad.
export const CAUSAS_RAIZ = [
  "Capacitación",
  "Control",
  "Cultura laboral",
  "Desarrollo de capital humano",
  "Estándar de consumo",
  "Falta de equipo",
  "Herramental",
  "Infraestructura",
  "Manual de maquinaria",
  "Planeación",
  "Procedimiento",
  "Reclutamiento",
  "Retraso de información",
  "Salud",
  "Seguridad industrial",
  "Stock de material",
  "Supervisión",
  "Tiempo extra",
] as const;

export const MAX_FOTOS_INFORME = 10;
export const BUCKET_FOTOS_NO_CONFORMIDAD = "calidad-no-conformidades";

export type TipoProblema = "proceso" | "informacion" | "capacitacion";

export const TIPO_PROBLEMA_LABELS: Record<TipoProblema, string> = {
  proceso: "Proceso",
  informacion: "Información",
  capacitacion: "Capacitación",
};

export interface MotivoCalidad {
  codigo: string;
  nombre: string;
  tipo: TipoProblema;
}

export interface AreaCalidad {
  area: string;
  responsable: string | null;
}

export interface AutorizadorCalidad {
  nombre: string;
  puesto: string;
}

export interface CatalogosCalidad {
  motivos: MotivoCalidad[];
  areas: AreaCalidad[];
  autorizadores: AutorizadorCalidad[];
}

// Áreas distintas, en el orden del catálogo.
export function nombresDeAreas(areas: AreaCalidad[]): string[] {
  return [...new Set(areas.map((a) => a.area))];
}

// Responsables de un área (puede no haber ninguno: entonces se escribe).
export function responsablesDeArea(areas: AreaCalidad[], area: string): string[] {
  return areas.filter((a) => a.area === area && a.responsable).map((a) => a.responsable as string);
}

export function etiquetaMotivo(m: MotivoCalidad): string {
  return `${m.codigo} · ${m.nombre}`;
}

export interface DetalleNoConformidad {
  tipoReporte: string;
  motivoCodigo: string;
  areaDeteccion: string;
  responsableDeteccion: string;
  areaOrigen: string;
  responsableOrigen: string;
  accionesCorrectivas: string;
  solucion: string;
  autoriza: string;
  material: string;
  manoObra: string;
  severidad: string;
  causaRaizTipo: string;
  causaRaiz: string;
  // Piezas (partes) afectadas: obligatorio sin lote, opcional con lote.
  piezasAfectadas: string;
}

export const DETALLE_VACIO: DetalleNoConformidad = {
  tipoReporte: "",
  motivoCodigo: "",
  areaDeteccion: "",
  responsableDeteccion: "",
  areaOrigen: "",
  responsableOrigen: "",
  accionesCorrectivas: "",
  solucion: "",
  autoriza: "",
  material: "",
  manoObra: "",
  severidad: "",
  causaRaizTipo: "",
  causaRaiz: "",
  piezasAfectadas: "",
};

// Mismo criterio de la base. `pedirPiezas`: el reporte no es de un lote.
export function validarDetalle(d: DetalleNoConformidad, pedirPiezas: boolean): string | null {
  if (!d.tipoReporte.trim()) return "Indica el tipo de reporte.";
  if (!d.motivoCodigo.trim()) return "Elige el motivo de la lista.";
  if (!d.areaDeteccion.trim()) return "Indica el área donde se detectó.";
  if (!d.responsableDeteccion.trim()) return "Indica el responsable del área donde se detectó.";
  if (!d.areaOrigen.trim()) return "Indica el área de origen.";
  if (!d.responsableOrigen.trim()) return "Indica el responsable del área de origen.";
  if (!d.accionesCorrectivas.trim()) return "Escribe las acciones correctivas.";
  const piezas = Number(d.piezasAfectadas.replace(",", "."));
  if (pedirPiezas && (!Number.isFinite(piezas) || piezas <= 0)) return "Indica cuántas piezas están afectadas.";
  if (d.piezasAfectadas.trim() && (!Number.isFinite(piezas) || piezas <= 0)) {
    return "Las piezas afectadas deben ser un número mayor que cero.";
  }
  return null;
}

// Argumentos de guardar_no_conformidad.
export function argumentosDetalle(informeId: string, d: DetalleNoConformidad) {
  const piezas = Number(d.piezasAfectadas.replace(",", "."));
  const opcional = (t: string) => t.trim() || null;
  return {
    p_informe_id: informeId,
    p_tipo_reporte: d.tipoReporte.trim(),
    p_motivo_codigo: d.motivoCodigo.trim(),
    p_area_deteccion: d.areaDeteccion.trim(),
    p_responsable_deteccion: d.responsableDeteccion.trim(),
    p_area_origen: d.areaOrigen.trim(),
    p_responsable_origen: d.responsableOrigen.trim(),
    p_acciones_correctivas: d.accionesCorrectivas.trim(),
    p_solucion: opcional(d.solucion),
    p_piezas_afectadas: Number.isFinite(piezas) && piezas > 0 ? piezas : null,
    p_autoriza: opcional(d.autoriza),
    p_material: opcional(d.material),
    p_mano_obra: opcional(d.manoObra),
    p_severidad: opcional(d.severidad),
    p_causa_raiz_tipo: opcional(d.causaRaizTipo),
    p_causa_raiz: opcional(d.causaRaiz),
  };
}

// --- Sugerencias automáticas -------------------------------------------------

// Lo que se sabe de quien produjo un lote rechazado.
export interface OrigenLote {
  proceso: Proceso;
  equipo: string;
  esPlanta: boolean;
  encargado: string | null;
}

// Área de origen y su responsable a partir del equipo que entregó el lote:
//  - un maquilador (no planta) es el área MAQUILADOR y su responsable es su
//    encargado (o el nombre del equipo);
//  - la planta es el área de su proceso (armado → PROD-ARMADO-MAD, barniz →
//    BARNIZ) y su responsable, el del catálogo si es uno solo, o el encargado.
// Solo propone áreas que existan en el catálogo.
export function origenSugerido(
  origen: OrigenLote,
  areas: AreaCalidad[]
): { areaOrigen: string; responsableOrigen: string } | null {
  const existe = (a: string) => areas.some((x) => x.area === a);
  if (!origen.esPlanta) {
    if (!existe("MAQUILADOR")) return null;
    return { areaOrigen: "MAQUILADOR", responsableOrigen: origen.encargado?.trim() || origen.equipo };
  }
  // Electrificación y Superficie Sólida no tienen área de planta en el catálogo: se elige a mano.
  const area =
    origen.proceso === "armado" ? "PROD-ARMADO-MAD" : origen.proceso === "barniz" ? "BARNIZ" : null;
  if (!area) return null;
  if (!existe(area)) return null;
  const delCatalogo = responsablesDeArea(areas, area);
  return {
    areaOrigen: area,
    responsableOrigen: origen.encargado?.trim() || (delCatalogo.length === 1 ? delCatalogo[0] : ""),
  };
}

// Calidad detecta casi todo: el área por defecto es CALIDAD y su responsable el
// del catálogo (si es uno solo).
export function deteccionSugerida(areas: AreaCalidad[]): { areaDeteccion: string; responsableDeteccion: string } | null {
  if (!areas.some((a) => a.area === "CALIDAD")) return null;
  const r = responsablesDeArea(areas, "CALIDAD");
  return { areaDeteccion: "CALIDAD", responsableDeteccion: r.length === 1 ? r[0] : "" };
}

// --- Estatus -----------------------------------------------------------------

export type EstatusNoConformidad = "abierto" | "en_proceso" | "cerrado";

export const ESTATUS_LABELS: Record<EstatusNoConformidad, string> = {
  abierto: "Abierto",
  en_proceso: "En proceso",
  cerrado: "Cerrado",
};

// Estatus de un reporte:
//  - sin lote: cerrado solo si Calidad lo cerró a mano (cerradoEn);
//  - de un lote: abierto mientras Producción no asigne el retrabajo, en proceso
//    cuando ya lo asignó y cerrado cuando Calidad aprobó todas las piezas
//    rechazadas (la fecha es la de la última aprobación).
export function estatusNoConformidad(entrada: {
  cerradoEn: string | null;
  esLote: boolean;
  piezasRechazadas: number;
  asignacionesRetrabajo: number;
  piezasAprobadasRetrabajo: number;
  fechaUltimaAprobacion: string | null;
}): { estatus: EstatusNoConformidad; fecha: string | null } {
  if (!entrada.esLote) {
    return entrada.cerradoEn ? { estatus: "cerrado", fecha: entrada.cerradoEn } : { estatus: "abierto", fecha: null };
  }
  if (entrada.piezasRechazadas > 0 && entrada.piezasAprobadasRetrabajo >= entrada.piezasRechazadas) {
    return { estatus: "cerrado", fecha: entrada.fechaUltimaAprobacion };
  }
  if (entrada.asignacionesRetrabajo > 0) return { estatus: "en_proceso", fecha: null };
  return { estatus: "abierto", fecha: null };
}

// Inicio y término de producción de un mueble: la primera asignación y la última
// entrega vigentes. Las fechas llegan como "AAAA-MM-DD" (ordenan como texto).
// El término solo existe si la producción terminó (todo lo asignado entregado).
export function periodoProduccion(
  asignaciones: { fecha_asignacion: string; cantidad: number; entregado: number }[],
  entregas: { fecha_entrega: string }[]
): { inicio: string | null; termino: string | null } {
  if (asignaciones.length === 0) return { inicio: null, termino: null };
  const inicio = asignaciones.map((a) => a.fecha_asignacion).sort()[0];
  const terminada = asignaciones.every((a) => a.entregado >= a.cantidad);
  const fin = entregas.map((e) => e.fecha_entrega).sort().at(-1) ?? null;
  return { inicio, termino: terminada ? fin : null };
}
