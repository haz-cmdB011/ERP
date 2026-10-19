// Por dónde va cada mueble entre los procesos de Producción (Armado, Barniz,
// Electrificación y Superficie Sólida): lo que pinta el flujo de la pantalla de
// asignaciones del PM. Sin base de datos, para poder probarlo.

import { PROCESO_LABELS, PROCESOS, type AsignacionResumen, type Proceso } from "./asignaciones";

export type EstadoProceso = "no_aplica" | "sin_asignar" | "en_proceso" | "terminado";

export interface MuebleFlujo {
  id: string;
  item_code: number;
  modelo: string | null;
  unidad: string | null;
  cantidad: number;
  // Procesos que el mueble lleva (Electrificación y Superficie Sólida dependen
  // de su descripción o la de sus componentes).
  aplica: Record<Proceso, boolean>;
  // Sin las canceladas.
  asignaciones: AsignacionResumen[];
}

export interface AvanceProceso {
  estado: EstadoProceso;
  asignado: number;
  entregado: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

// Asignado y entregado del proceso. El retrabajo no cuenta contra la cantidad,
// pero mientras siga abierto el proceso no está terminado.
export function avanceProceso(m: MuebleFlujo, p: Proceso): AvanceProceso {
  if (!m.aplica[p]) return { estado: "no_aplica", asignado: 0, entregado: 0 };
  const delProceso = m.asignaciones.filter((a) => a.proceso === p && !a.cancelada_en);
  const normales = delProceso.filter((a) => !a.informe_rechazo_id);
  const asignado = redondear(normales.reduce((s, a) => s + Number(a.cantidad), 0));
  const entregado = redondear(normales.reduce((s, a) => s + Number(a.entregado), 0));
  if (normales.length === 0) return { estado: "sin_asignar", asignado, entregado };
  const retrabajoAbierto = delProceso.some((a) => a.informe_rechazo_id && a.estado !== "entregada");
  const estado = entregado >= m.cantidad && !retrabajoAbierto ? "terminado" : "en_proceso";
  return { estado, asignado, entregado };
}

// El estado del mueble completo, para filtrar.
export type EstadoMueble = "por_asignar" | "en_proceso" | "terminado";

export function estadoMueble(m: MuebleFlujo): EstadoMueble {
  const estados = PROCESOS.map((p) => avanceProceso(m, p).estado).filter((e) => e !== "no_aplica");
  if (estados.every((e) => e === "terminado")) return "terminado";
  if (estados.some((e) => e === "en_proceso")) return "en_proceso";
  return "por_asignar";
}

// A dónde va el mueble: el primer proceso que aplica y no está terminado.
export function siguientePaso(m: MuebleFlujo): string {
  for (const p of PROCESOS) {
    const { estado } = avanceProceso(m, p);
    if (estado === "sin_asignar") return `Asignar a ${PROCESO_LABELS[p]}`;
    if (estado === "en_proceso") return `En ${PROCESO_LABELS[p]}`;
  }
  return "Terminado";
}

// Piezas terminadas contra piezas que lleva el proceso, sumando los muebles que lo llevan.
export function totalesProceso(muebles: MuebleFlujo[], p: Proceso) {
  let piezas = 0;
  let asignado = 0;
  let entregado = 0;
  let conProceso = 0;
  for (const m of muebles) {
    if (!m.aplica[p]) continue;
    const a = avanceProceso(m, p);
    conProceso += 1;
    piezas += m.cantidad;
    asignado += Math.min(a.asignado, m.cantidad);
    entregado += Math.min(a.entregado, m.cantidad);
  }
  return {
    muebles: conProceso,
    piezas: redondear(piezas),
    asignado: redondear(asignado),
    entregado: redondear(entregado),
  };
}

// 0–100, para las barras.
export function porcentaje(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((parte / total) * 100)));
}
