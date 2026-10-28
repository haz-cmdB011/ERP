// Inicio de Producción: un vistazo a todos los muebles padre vigentes (por liberar, por
// asignar, en el taller, terminados), qué modelos se repiten en varias O.T./PM y qué O.T.
// tienen trabajo pendiente. Sin base de datos ni navegador, para poder probarlo; la lectura
// vive en inicio-db.ts.

import type { EstadoMueble } from "./flujo-mueble";

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
  // Cuándo se subió su PM (ISO): lo más reciente sale primero.
  creadoEn: string;
}

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

export interface ModeloCompartido {
  modelo: string;
  descripcion: string | null;
  muebles: number;
  pms: PmDeModelo[];
  conteos: Conteos;
  // El PM más reciente que lo tiene.
  reciente: string;
}

const claveModelo = (m: string | null) => (m ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
const masReciente = (a: string, b: string) => (b > a ? b : a);

// Modelos que aparecen en más de un PM, con cuántos muebles hay en cada estado. Primero los
// de los PM más recientes; dentro de cada modelo, sus PM del más reciente al más viejo.
export function modelosCompartidos(muebles: MuebleInicio[]): ModeloCompartido[] {
  const porModelo = new Map<string, ModeloCompartido & { idsPm: Set<string> }>();
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
        reciente: m.creadoEn,
        idsPm: new Set(),
      };
      porModelo.set(clave, g);
    }
    g.muebles += 1;
    g.conteos[m.estado] += 1;
    g.reciente = masReciente(g.reciente, m.creadoEn);
    if (!g.idsPm.has(m.pedidoId)) {
      g.idsPm.add(m.pedidoId);
      g.pms.push({ pedidoId: m.pedidoId, numeroPm: m.numeroPm, ot: m.ot, creadoEn: m.creadoEn });
    }
  }
  return [...porModelo.values()]
    .filter((g) => g.pms.length > 1)
    .map((g) => ({
      modelo: g.modelo,
      descripcion: g.descripcion,
      muebles: g.muebles,
      conteos: g.conteos,
      reciente: g.reciente,
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

// O.T. con algo pendiente (por liberar, por asignar o en el taller), la más reciente primero.
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
    g.reciente = masReciente(g.reciente, m.creadoEn);
    g.idsPm.add(m.pedidoId);
  }
  return [...porOt.values()]
    .map(({ idsPm, ...g }) => ({ ...g, pms: idsPm.size }))
    .filter((g) => pendientesDe(g.conteos) > 0)
    .sort((a, b) => b.reciente.localeCompare(a.reciente) || natural(b.ot, a.ot));
}
