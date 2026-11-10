// Inicio de Producción: un vistazo a todos los muebles padre vigentes (por liberar, por
// asignar, en el taller, terminados), los modelos más recientes y qué O.T.
// tienen trabajo pendiente. Sin base de datos ni navegador, para poder probarlo; la lectura
// vive en inicio-db.ts.

import {
  avanceColumna,
  avancePaso,
  columnasMueble,
  indiceSiguiente,
  partesConRuta,
  type EstadoMueble,
  type EstadoProceso,
  type MuebleFlujo,
} from "./flujo-mueble";
import { etiquetaPaso } from "./ruta";

export type EstadoInicio = "por_liberar" | EstadoMueble;

export const ESTADOS_INICIO: { valor: EstadoInicio; etiqueta: string }[] = [
  { valor: "por_liberar", etiqueta: "Por liberar" },
  { valor: "por_asignar", etiqueta: "Por asignar" },
  { valor: "en_proceso", etiqueta: "En taller" },
  { valor: "terminado", etiqueta: "Terminados" },
];

export interface MuebleInicio {
  id: string;
  modelo: string | null;
  descripcion: string | null;
  estado: EstadoInicio;
  pedidoId: string;
  numeroPm: string;
  ot: string | null;
  // Cuántas piezas pide el PM de este mueble y su unidad (para la bitácora de taller).
  cantidad?: number;
  unidad?: string | null;
  // Cuándo se subió su PM (ISO): lo más reciente sale primero.
  creadoEn: string;
  // Lo último que le pasó al mueble (ISO): subida del PM, liberación, asignación o entrega. Ordena
  // "Muebles recientes", para que un mueble con movimiento suba aunque su PM sea viejo. Sin
  // dato, cuenta la subida del PM.
  actividad?: string;
  // De qué fue esa actividad (por omisión, la subida del PM).
  actividadTipo?: TipoActividad;
  // Cómo va cada proceso de su ruta (Armado, Barniz…). Solo los liberados lo traen.
  procesos?: ProcesoAvance[];
  // Ids de sus asignaciones cuya entrega se hace por partes del despiece (ver partesParaEntrega).
  entregaPorPartes?: string[];
  // Lo que todavía no se asigna del paso en que va (ver faltaPorAsignar); ausente si no hay o no se sabe.
  faltaAsignar?: FaltaAsignar;
}

// Piezas del paso en que va un mueble que siguen sin equipo: de un mueble de 13 con 5 asignadas en Armado,
// faltan 8 de 13. Es el mismo tope que aplica la base al asignar (crear_asignacion_produccion).
export interface FaltaAsignar {
  cantidad: number;
  total: number;
  // El paso ("Armado", "Barniz 2").
  etiqueta: string;
}

// Un proceso del mueble (Armado, Barniz 2…) con su avance en % y su estado.
export interface ProcesoAvance {
  etiqueta: string;
  pct: number;
  estado: EstadoProceso;
}

// Cómo va cada proceso de un mueble liberado, en el orden sugerido (el mismo avance de las columnas del
// panel de asignación). Vacío si su ruta no lleva ninguno.
export function procesosDeMueble(m: MuebleFlujo): ProcesoAvance[] {
  return columnasMueble(m).map((c) => {
    const a = avanceColumna(m, c);
    return { etiqueta: c.etiqueta, pct: a.pct, estado: a.estado };
  });
}

// Lo que falta por asignar en el paso en que va el mueble completo (el primero que no está terminado), o
// null si ya está todo asignado, si ya terminó o si va por partes (esos se ven y se asignan en el panel).
export function faltaPorAsignar(m: MuebleFlujo): FaltaAsignar | null {
  if (m.porPartes || partesConRuta(m).length > 0) return null;
  const i = indiceSiguiente(m);
  if (i === null) return null;
  const a = avancePaso(m, i);
  if (a.disponible <= 0) return null;
  return { cantidad: a.disponible, total: a.total, etiqueta: etiquetaPaso(m.ruta, i) };
}

// Qué fue lo último que le pasó a un mueble: se subió su PM, se liberó, se asignó o se entregó algo.
export type TipoActividad = "pm" | "liberacion" | "asignacion" | "entrega";

export const ETIQUETA_ACTIVIDAD: Record<TipoActividad, string> = {
  pm: "PM subido",
  liberacion: "Liberado a producción",
  asignacion: "Asignado a un equipo",
  entrega: "Entrega registrada",
};

export type Conteos = Record<EstadoInicio, number>;

const vacio = (): Conteos => ({ por_liberar: 0, por_asignar: 0, en_proceso: 0, terminado: 0 });

export function contarInicio(muebles: MuebleInicio[]): Conteos {
  const c = vacio();
  for (const m of muebles) c[m.estado] += 1;
  return c;
}

// Lo que sigue esperando algo de Producción (todo menos lo terminado).
export const pendientesDe = (c: Conteos) => c.por_liberar + c.por_asignar + c.en_proceso;

export interface PmDeModelo {
  pedidoId: string;
  numeroPm: string;
  ot: string | null;
  creadoEn: string;
}

export interface ModeloReciente {
  modelo: string;
  descripcion: string | null;
  muebles: number;
  pms: PmDeModelo[];
  conteos: Conteos;
  // Lo último que le pasó a alguno de sus muebles (ver MuebleInicio.actividad) y de qué fue.
  reciente: string;
  tipoReciente: TipoActividad;
}

// Modelos en "Muebles recientes" (inicio y panel de asignación): los de los PM más recientes.
export const MAX_MODELOS_RECIENTES = 30;

export const claveModelo = (m: string | null) => (m ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
const masReciente = (a: string, b: string) => (b > a ? b : a);

// Cada modelo con todos sus PM (estén en uno o en varios) y cuántos muebles hay en cada estado.
// Primero los que tuvieron movimiento más reciente; dentro de cada modelo, sus PM del más
// reciente al más viejo.
export function modelosRecientes(muebles: MuebleInicio[]): ModeloReciente[] {
  const porModelo = new Map<string, ModeloReciente & { idsPm: Set<string> }>();
  for (const m of muebles) {
    const clave = claveModelo(m.modelo);
    if (!clave) continue;
    let g = porModelo.get(clave);
    if (!g) {
      g = {
        modelo: clave,
        descripcion: m.descripcion,
        muebles: 0,
        pms: [],
        conteos: vacio(),
        reciente: m.actividad ?? m.creadoEn,
        tipoReciente: m.actividadTipo ?? "pm",
        idsPm: new Set(),
      };
      porModelo.set(clave, g);
    }
    g.muebles += 1;
    g.conteos[m.estado] += 1;
    const cuando = m.actividad ?? m.creadoEn;
    if (cuando > g.reciente) {
      g.reciente = cuando;
      g.tipoReciente = m.actividadTipo ?? "pm";
    }
    if (!g.idsPm.has(m.pedidoId)) {
      g.idsPm.add(m.pedidoId);
      g.pms.push({ pedidoId: m.pedidoId, numeroPm: m.numeroPm, ot: m.ot, creadoEn: m.creadoEn });
    }
  }
  return [...porModelo.values()]
    .map((g) => ({
      modelo: g.modelo,
      descripcion: g.descripcion,
      muebles: g.muebles,
      conteos: g.conteos,
      reciente: g.reciente,
      tipoReciente: g.tipoReciente,
      pms: g.pms.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn) || natural(b.numeroPm, a.numeroPm)),
    }))
    .sort((a, b) => b.reciente.localeCompare(a.reciente) || b.pms.length - a.pms.length || natural(a.modelo, b.modelo));
}

export interface OtPendiente {
  ot: string;
  pms: number;
  conteos: Conteos;
  // Un PM de la O.T. (para enlazar cuando no hay O.T. con formato).
  pedidoId: string;
  reciente: string;
}

// O.T. con algo pendiente (por liberar, por asignar o en el taller), primero la de movimiento más
// reciente (subida del PM, liberación, asignación o entrega de cualquiera de sus muebles).
export function otsConPendientes(muebles: MuebleInicio[]): OtPendiente[] {
  const porOt = new Map<string, OtPendiente & { idsPm: Set<string> }>();
  for (const m of muebles) {
    const ot = m.ot ?? m.numeroPm;
    let g = porOt.get(ot);
    if (!g) {
      g = { ot, pms: 0, conteos: vacio(), pedidoId: m.pedidoId, reciente: m.creadoEn, idsPm: new Set() };
      porOt.set(ot, g);
    }
    g.conteos[m.estado] += 1;
    g.reciente = masReciente(g.reciente, m.actividad ?? m.creadoEn);
    g.idsPm.add(m.pedidoId);
  }
  return [...porOt.values()]
    .map(({ idsPm, ...g }) => ({ ...g, pms: idsPm.size }))
    .filter((g) => pendientesDe(g.conteos) > 0)
    .sort((a, b) => b.reciente.localeCompare(a.reciente) || natural(b.ot, a.ot));
}
