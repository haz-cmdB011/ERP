// Por dónde va cada mueble en su ruta de Producción (Armado, Superficie Sólida,
// Barniz, Electrificación, con pasos que se pueden repetir): lo que pinta el
// flujo de la pantalla de asignaciones del PM. Sin base de datos, para poder
// probarlo.

import { esRetrabajo, type AsignacionResumen, type Proceso } from "./asignaciones";
import { etiquetaPaso, type PasoRuta } from "./ruta";

export type EstadoProceso = "sin_asignar" | "en_proceso" | "terminado";

export interface MuebleFlujo {
  id: string;
  item_code: number;
  modelo: string | null;
  unidad: string | null;
  cantidad: number;
  // Procesos que el mueble puede llevar (Electrificación y Superficie Sólida
  // dependen de su descripción o la de sus componentes).
  aplica: Record<Proceso, boolean>;
  // La ruta guardada o, si aún no tiene, la sugerida (pasos con id null).
  ruta: PasoRuta[];
  // Versión de la ruta guardada (0 = todavía no se guarda), para el bloqueo
  // optimista de guardar_ruta_produccion.
  versionRuta: number;
  asignaciones: AsignacionResumen[];
  // Revisión final de Calidad: piezas que ya aprobó. null u omitido si la
  // revisión final está apagada (ajuste revision_final).
  revisionFinal?: { aprobadas: number } | null;
}

// Con la revisión final encendida, un mueble con toda su ruta terminada todavía
// espera a Calidad; sale a obra cuando la revisión final aprueba su cantidad.
// null: la revisión final está apagada.
export function estadoObra(m: MuebleFlujo): "liberado" | "en_revision_final" | null {
  if (!m.revisionFinal) return null;
  return m.revisionFinal.aprobadas >= m.cantidad ? "liberado" : "en_revision_final";
}

export interface AvancePaso {
  estado: EstadoProceso;
  asignado: number;
  entregado: number;
  // Lo que falta por asignar en este paso (tope: la cantidad del mueble).
  disponible: number;
  // Lo que se puede asignar sin adelantarse al paso anterior: lo que ese paso
  // ya entregó y Producción verificó, menos lo ya asignado aquí. En el primer
  // paso es todo lo disponible.
  listo: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

// En qué paso de la ruta va cada asignación: el suyo (paso_id) o, si no está en
// la ruta (ruta sin guardar, paso quitado), el primero de su mismo proceso.
export function pasoDeAsignacion(m: MuebleFlujo, a: AsignacionResumen): number {
  const porId = a.paso_id ? m.ruta.findIndex((p) => p.id === a.paso_id) : -1;
  if (porId >= 0) return porId;
  return m.ruta.findIndex((p) => p.proceso === a.proceso);
}

// Las asignaciones del paso, incluidas las canceladas y los retrabajos.
export function asignacionesDelPaso(m: MuebleFlujo, indice: number): AsignacionResumen[] {
  return m.asignaciones.filter((a) => pasoDeAsignacion(m, a) === indice);
}

// Un paso con asignaciones vigentes no se puede quitar de la ruta.
export function pasoConAsignaciones(m: MuebleFlujo, indice: number): boolean {
  return asignacionesDelPaso(m, indice).some((a) => !a.cancelada_en);
}

function sumas(lista: AsignacionResumen[]) {
  return {
    asignado: redondear(lista.reduce((s, a) => s + Number(a.cantidad), 0)),
    entregado: redondear(lista.reduce((s, a) => s + Number(a.entregado), 0)),
    verificado: redondear(lista.reduce((s, a) => s + Number(a.verificado ?? 0), 0)),
  };
}

// Sin canceladas ni retrabajos: lo que cuenta contra la cantidad del mueble.
function normalesDelPaso(m: MuebleFlujo, indice: number): AsignacionResumen[] {
  return asignacionesDelPaso(m, indice).filter((a) => !a.cancelada_en && !esRetrabajo(a));
}

// Asignado, entregado y lo que queda del paso. El retrabajo no cuenta contra la
// cantidad, pero mientras siga abierto el paso no está terminado. Mismo cálculo
// que crear_asignacion_produccion (tope y `adelantada`).
export function avancePaso(m: MuebleFlujo, indice: number): AvancePaso {
  const delPaso = asignacionesDelPaso(m, indice).filter((a) => !a.cancelada_en);
  const normales = delPaso.filter((a) => !esRetrabajo(a));
  const { asignado, entregado } = sumas(normales);
  const disponible = Math.max(0, redondear(m.cantidad - asignado));
  const listo =
    indice === 0
      ? disponible
      : Math.min(disponible, Math.max(0, redondear(sumas(normalesDelPaso(m, indice - 1)).verificado - asignado)));
  let estado: EstadoProceso;
  if (normales.length === 0) estado = "sin_asignar";
  else {
    const retrabajoAbierto = delPaso.some((a) => esRetrabajo(a) && a.estado !== "entregada");
    estado = entregado >= m.cantidad && !retrabajoAbierto ? "terminado" : "en_proceso";
  }
  return { estado, asignado, entregado, disponible, listo };
}

// El estado del mueble completo, para filtrar.
export type EstadoMueble = "por_asignar" | "en_proceso" | "terminado";

export function estadoMueble(m: MuebleFlujo): EstadoMueble {
  const estados = m.ruta.map((_, i) => avancePaso(m, i).estado);
  if (estados.length > 0 && estados.every((e) => e === "terminado")) return "terminado";
  if (estados.some((e) => e === "en_proceso")) return "en_proceso";
  return "por_asignar";
}

// Índice del primer paso que no está terminado (null si ya terminó todo).
export function indiceSiguiente(m: MuebleFlujo): number | null {
  const i = m.ruta.findIndex((_, j) => avancePaso(m, j).estado !== "terminado");
  return i >= 0 ? i : null;
}

// A dónde va el mueble: el primer paso que no está terminado.
export function siguientePaso(m: MuebleFlujo): string {
  const i = indiceSiguiente(m);
  if (i === null) return "Terminado";
  const etiqueta = etiquetaPaso(m.ruta, i);
  return avancePaso(m, i).estado === "sin_asignar" ? `Asignar a ${etiqueta}` : `En ${etiqueta}`;
}

// Piezas terminadas contra piezas que lleva el proceso, sumando los muebles que
// lo llevan. Un proceso que se repite en la ruta cuenta cada vez (Armado dos
// veces = el doble de piezas de armado).
export function totalesProceso(muebles: MuebleFlujo[], p: Proceso) {
  let piezas = 0;
  let asignado = 0;
  let entregado = 0;
  let conProceso = 0;
  for (const m of muebles) {
    let lleva = false;
    m.ruta.forEach((paso, i) => {
      if (paso.proceso !== p) return;
      lleva = true;
      const a = avancePaso(m, i);
      piezas += m.cantidad;
      asignado += Math.min(a.asignado, m.cantidad);
      entregado += Math.min(a.entregado, m.cantidad);
    });
    if (lleva) conProceso += 1;
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
