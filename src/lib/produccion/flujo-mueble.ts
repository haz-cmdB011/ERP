// Por dónde va cada mueble en su ruta de Producción (Armado, Superficie Sólida,
// Barniz, Electrificación, con pasos que se pueden repetir): lo que pinta el
// flujo de la pantalla de asignaciones del PM. Sin base de datos, para poder
// probarlo.

import { esRetrabajo, PROCESOS, type AsignacionResumen, type Proceso } from "./asignaciones";
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
  // Partes vigentes de su despiece (migración despiece_por_partes): se pueden
  // asignar por separado. Omitido si la pantalla no las leyó: entonces cuentan las
  // partes que ya tienen asignaciones.
  partes?: ParteMueble[];
}

// Una parte del despiece del mueble.
export interface ParteMueble {
  id: string;
  descripcion: string;
  piezasPorMueble: number;
  unidad: string | null;
}

// Cómo va una parte en un paso (todo en muebles: lo del mueble completo cuenta para
// todas sus partes).
export interface AvanceParte {
  asignado: number;
  entregado: number;
  disponible: number;
  listo: number;
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
  // Piezas que Calidad rechazó en los lotes del paso y nadie ha reasignado:
  // mientras haya, el paso no está terminado.
  porReasignar: number;
  // Por parte del despiece (vacío si el mueble no tiene partes).
  partes: Record<string, AvanceParte>;
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

type Campo = "cantidad" | "entregado" | "verificado";

// Las partes que cuentan: las vigentes del despiece o, si la pantalla no las leyó,
// las que ya tienen asignaciones.
function idsPartes(m: MuebleFlujo): string[] {
  if (m.partes) return m.partes.map((p) => p.id);
  return [...new Set(m.asignaciones.flatMap((a) => (a.parte_id ? [a.parte_id] : [])))];
}

// Lo del mueble completo y lo de cada parte en una lista de asignaciones.
function porParte(lista: AsignacionResumen[], campo: Campo) {
  const valor = (a: AsignacionResumen) => Number(a[campo] ?? 0);
  const mueble = redondear(lista.filter((a) => !a.parte_id).reduce((s, a) => s + valor(a), 0));
  const partes = new Map<string, number>();
  for (const a of lista) {
    if (a.parte_id) partes.set(a.parte_id, redondear((partes.get(a.parte_id) ?? 0) + valor(a)));
  }
  return { mueble, de: (id: string) => partes.get(id) ?? 0 };
}

// Lo del mueble completo más lo de su parte más atrasada: un mueble cuenta cuando
// todas sus partes. Mismo cálculo que cobertura_por_partes en la base.
function cobertura(ids: string[], lista: AsignacionResumen[], campo: Campo): number {
  const s = porParte(lista, campo);
  return ids.length === 0 ? s.mueble : redondear(s.mueble + Math.min(...ids.map(s.de)));
}

// Sin canceladas ni retrabajos: lo que cuenta contra la cantidad del mueble.
function normalesDelPaso(m: MuebleFlujo, indice: number): AsignacionResumen[] {
  return asignacionesDelPaso(m, indice).filter((a) => !a.cancelada_en && !esRetrabajo(a));
}

// Asignado, entregado y lo que queda del paso. El retrabajo no cuenta contra la
// cantidad, pero mientras siga abierto (o haya rechazos de Calidad sin
// reasignar) el paso no está terminado. Con partes, el paso va en lo de la parte
// más atrasada. Mismo cálculo que crear_asignacion_produccion (tope y `adelantada`).
export function avancePaso(m: MuebleFlujo, indice: number): AvancePaso {
  const ids = idsPartes(m);
  const delPaso = asignacionesDelPaso(m, indice).filter((a) => !a.cancelada_en);
  const normales = delPaso.filter((a) => !esRetrabajo(a));
  const anteriores = indice === 0 ? null : normalesDelPaso(m, indice - 1);
  const asignado = cobertura(ids, normales, "cantidad");
  const entregado = cobertura(ids, normales, "entregado");

  const asig = porParte(normales, "cantidad");
  const entr = porParte(normales, "entregado");
  const veri = anteriores ? porParte(anteriores, "verificado") : null;
  // Lo que se puede asignar sin adelantarse a una parte: lo que el paso anterior le
  // verificó menos lo que ya tiene aquí.
  const listoDe = (asignadoAqui: number, verificadoAntes: number, disponible: number) =>
    veri ? Math.min(disponible, Math.max(0, redondear(verificadoAntes - asignadoAqui))) : disponible;

  const partes: Record<string, AvanceParte> = {};
  for (const id of ids) {
    const asignadoParte = redondear(asig.mueble + asig.de(id));
    const disponible = Math.max(0, redondear(m.cantidad - asignadoParte));
    partes[id] = {
      asignado: asignadoParte,
      entregado: redondear(entr.mueble + entr.de(id)),
      disponible,
      listo: listoDe(asignadoParte, veri ? veri.mueble + veri.de(id) : 0, disponible),
    };
  }
  // El mueble completo cuenta para todas sus partes: cabe lo que le quede a la que más lleva.
  const maxParte = ids.length ? Math.max(...ids.map(asig.de)) : 0;
  const disponible = Math.max(0, redondear(m.cantidad - asig.mueble - maxParte));
  const listo =
    ids.length === 0
      ? listoDe(asig.mueble, veri?.mueble ?? 0, disponible)
      : Math.min(disponible, ...ids.map((id) => listoDe(partes[id].asignado, veri ? veri.mueble + veri.de(id) : 0, m.cantidad)));

  const porReasignar = redondear(delPaso.reduce((s, a) => s + Number(a.rechazado_por_reasignar ?? 0), 0));
  let estado: EstadoProceso;
  if (normales.length === 0) estado = "sin_asignar";
  else {
    const retrabajoAbierto = delPaso.some((a) => esRetrabajo(a) && a.estado !== "entregada");
    estado = entregado >= m.cantidad && !retrabajoAbierto && porReasignar <= 0 ? "terminado" : "en_proceso";
  }
  return { estado, asignado, entregado, disponible, listo, porReasignar, partes };
}

// Un paso de la ruta del mueble, tal como se ofrece en el formulario de asignación.
export interface OpcionPaso {
  // Posición en la ruta (0 = primer paso).
  indice: number;
  // null mientras la ruta sea la sugerida y no se haya guardado: la base usa el
  // paso de ese proceso.
  id: string | null;
  proceso: Proceso;
  etiqueta: string;
  // Lo que falta por asignar en el paso (tope: la cantidad del mueble).
  disponible: number;
  // Lo que ya entregó el paso anterior y aún no se asigna aquí.
  listo: number;
  // Etiqueta del paso anterior (null en el primero).
  anterior: string | null;
  // Lo mismo por parte del despiece (vacío si el mueble no tiene partes).
  partes: { id: string; disponible: number; listo: number }[];
}

// Los pasos de la ruta del mueble como opciones del formulario de asignación.
export function opcionesDePasos(m: MuebleFlujo): OpcionPaso[] {
  return m.ruta.map((p, i) => {
    const a = avancePaso(m, i);
    return {
      indice: i,
      id: p.id,
      proceso: p.proceso,
      etiqueta: etiquetaPaso(m.ruta, i),
      disponible: a.disponible,
      listo: a.listo,
      anterior: i > 0 ? etiquetaPaso(m.ruta, i - 1) : null,
      partes: Object.entries(a.partes).map(([id, x]) => ({ id, disponible: x.disponible, listo: x.listo })),
    };
  });
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

// Por proceso, lo que falta por asignar en el primer paso de ese proceso que
// aún tiene lugar (el mismo que elige crear_asignacion_produccion cuando no se
// le dice el paso) y cuánto de eso ya entregó el paso anterior. Lo que la ruta
// no lleva queda en 0.
export function disponibleDe(m: MuebleFlujo): {
  disponible: Record<Proceso, number>;
  listo: Record<Proceso, number>;
} {
  const disponible = Object.fromEntries(PROCESOS.map((p) => [p, 0])) as Record<Proceso, number>;
  const listo = { ...disponible };
  for (const p of PROCESOS) {
    const i = m.ruta.findIndex((x, j) => x.proceso === p && avancePaso(m, j).disponible > 0);
    if (i < 0) continue;
    const a = avancePaso(m, i);
    disponible[p] = a.disponible;
    listo[p] = a.listo;
  }
  return { disponible, listo };
}
