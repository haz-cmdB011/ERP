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
  // Tiene componentes vigentes en el PM: entonces se asigna por su despiece y, sin
  // despiece guardado, no se asigna (requiere_despiece en la base). Omitido = no se sabe.
  conComponentes?: boolean;
  // Dónde se hace su despiece (null u omitido si la pantalla no lo sabe).
  despieceHref?: string | null;
}

// Una parte del despiece del mueble.
export interface ParteMueble {
  id: string;
  descripcion: string;
  piezasPorMueble: number;
  unidad: string | null;
  // % del mueble que vale (todas suman 100). null: las partes valen lo mismo.
  porcentaje?: number | null;
  // Procesos de la ruta del mueble que esta parte se salta (ej. el herraje no va a
  // Barniz). Omitido = lleva todos.
  procesosOmitidos?: Proceso[];
}

// ¿La parte pasa por este proceso?
export function parteLleva(parte: Pick<ParteMueble, "procesosOmitidos">, proceso: Proceso): boolean {
  return !(parte.procesosOmitidos ?? []).includes(proceso);
}

// Se asigna completo (en muebles): no tiene componentes ni partes. Los demás se asignan
// por partes de su despiece, una a una, así que no entran en "Asignar varios a un equipo".
export function seAsignaCompleto(m: MuebleFlujo): boolean {
  return !m.conComponentes && (m.partes?.length ?? 0) === 0;
}

// Hay que guardar el despiece antes de asignar: tiene componentes y aún no tiene partes.
export function requiereDespiece(m: MuebleFlujo): boolean {
  return !!m.conComponentes && (m.partes?.length ?? 0) === 0;
}

// El % del mueble que vale cada parte: el guardado o, si falta en alguna, partes iguales.
export function pesosPartes(partes: ParteMueble[]): Map<string, number> {
  const completos = partes.length > 0 && partes.every((p) => p.porcentaje != null);
  const total = completos ? partes.reduce((s, p) => s + Number(p.porcentaje), 0) : 0;
  return new Map(
    partes.map((p) => [p.id, completos && total > 0 ? (Number(p.porcentaje) / total) * 100 : 100 / partes.length])
  );
}

// Cómo va una parte en un paso, en PIEZAS de la parte (migración
// partes_en_piezas_y_ruta_por_parte): lo del mueble completo cuenta para todas sus
// partes, por sus piezas por mueble.
export interface AvanceParte {
  // Piezas de la parte en el paso: piezas por mueble × cantidad del mueble.
  total: number;
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
// las que ya tienen asignaciones (sin sus datos: 1 pieza por mueble, todos los procesos).
function partesDe(m: MuebleFlujo): ParteMueble[] {
  if (m.partes) return m.partes;
  return [...new Set(m.asignaciones.flatMap((a) => (a.parte_id ? [a.parte_id] : [])))].map((id) => ({
    id,
    descripcion: "",
    piezasPorMueble: 1,
    unidad: null,
  }));
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

// En muebles, con dos decimales hacia abajo (mismo criterio que la base: trunc).
const truncar = (n: number) => Math.floor(n * 100 + 1e-9) / 100;

// Sin canceladas ni retrabajos: lo que cuenta contra la cantidad del mueble.
function normalesDelPaso(m: MuebleFlujo, indice: number): AsignacionResumen[] {
  return asignacionesDelPaso(m, indice).filter((a) => !a.cancelada_en && !esRetrabajo(a));
}

// Asignado, entregado y lo que queda del paso. El retrabajo no cuenta contra la
// cantidad, pero mientras siga abierto (o haya rechazos de Calidad sin
// reasignar) el paso no está terminado.
//
// Con partes, cada una va en sus piezas y solo cuentan las que llevan el proceso del
// paso; el paso (en muebles) va en lo de la parte más atrasada, pasada a muebles. Si
// ninguna parte lleva el proceso, el paso no les aplica y cuenta como terminado. Mismo
// cálculo que crear_asignacion_produccion (tope y `adelantada`) y cobertura_por_partes.
export function avancePaso(m: MuebleFlujo, indice: number): AvancePaso {
  const proceso = m.ruta[indice]?.proceso;
  const todas = partesDe(m);
  const partesPaso = proceso ? todas.filter((p) => parteLleva(p, proceso)) : todas;
  const delPaso = asignacionesDelPaso(m, indice).filter((a) => !a.cancelada_en);
  const normales = delPaso.filter((a) => !esRetrabajo(a));
  const porReasignar = redondear(delPaso.reduce((s, a) => s + Number(a.rechazado_por_reasignar ?? 0), 0));

  if (todas.length > 0 && partesPaso.length === 0) {
    const c = m.cantidad;
    return { estado: "terminado", asignado: c, entregado: c, disponible: 0, listo: 0, porReasignar, partes: {} };
  }

  const asig = porParte(normales, "cantidad");
  const entr = porParte(normales, "entregado");

  // El paso anterior de cada parte: el último antes de este que la parte lleva (para el
  // mueble completo, el anterior de la ruta).
  const anteriorDe = (p: ParteMueble | null) => {
    for (let j = indice - 1; j >= 0; j--) {
      if (!p || parteLleva(p, m.ruta[j].proceso)) return j;
    }
    return null;
  };
  const verificadoAntes = (p: ParteMueble | null) => {
    const j = anteriorDe(p);
    if (j === null) return null;
    const v = porParte(normalesDelPaso(m, j), "verificado");
    return p ? redondear(v.mueble * p.piezasPorMueble + v.de(p.id)) : v.mueble;
  };
  // Lo que se puede asignar sin adelantarse: lo que el paso anterior verificó menos lo
  // que ya hay aquí; sin paso anterior, todo lo disponible.
  const listoDe = (asignadoAqui: number, antes: number | null, disponible: number) =>
    antes === null ? disponible : Math.min(disponible, Math.max(0, redondear(antes - asignadoAqui)));

  const partes: Record<string, AvanceParte> = {};
  for (const p of partesPaso) {
    const total = redondear(m.cantidad * p.piezasPorMueble);
    const asignadoParte = redondear(asig.mueble * p.piezasPorMueble + asig.de(p.id));
    const disponible = Math.max(0, redondear(total - asignadoParte));
    partes[p.id] = {
      total,
      asignado: asignadoParte,
      entregado: redondear(entr.mueble * p.piezasPorMueble + entr.de(p.id)),
      disponible,
      listo: listoDe(asignadoParte, verificadoAntes(p), disponible),
    };
  }

  // En muebles: lo del mueble completo más la parte más atrasada (asignado, entregado)
  // o la que más lleva (lo que le cabe al mueble completo).
  const enMuebles = (f: (p: ParteMueble) => number, g: (xs: number[]) => number) =>
    partesPaso.length === 0 ? 0 : truncar(g(partesPaso.map((p) => f(p) / p.piezasPorMueble)));
  const asignado = redondear(asig.mueble + enMuebles((p) => asig.de(p.id), (xs) => Math.min(...xs)));
  const entregado = redondear(entr.mueble + enMuebles((p) => entr.de(p.id), (xs) => Math.min(...xs)));
  const disponible = Math.max(
    0,
    redondear(m.cantidad - asig.mueble - enMuebles((p) => asig.de(p.id), (xs) => Math.max(...xs)))
  );
  const listo =
    partesPaso.length === 0
      ? listoDe(asig.mueble, verificadoAntes(null), disponible)
      : Math.min(disponible, ...partesPaso.map((p) => truncar(partes[p.id].listo / p.piezasPorMueble)));

  let estado: EstadoProceso;
  if (normales.length === 0) estado = "sin_asignar";
  else {
    const retrabajoAbierto = delPaso.some((a) => esRetrabajo(a) && a.estado !== "entregada");
    estado = entregado >= m.cantidad && !retrabajoAbierto && porReasignar <= 0 ? "terminado" : "en_proceso";
  }
  return { estado, asignado, entregado, disponible, listo, porReasignar, partes };
}

// Avance del paso en % del mueble (0–100), ponderado por el % de cada parte que lleva
// el proceso (los % se reparten entre ellas): lo del mueble completo cuenta entero y
// cada parte suma su % por lo que entregó de sus piezas. Sin partes, lo entregado
// contra la cantidad. Solo para mostrar: el cobro y la revisión final siguen contando
// un mueble cuando todas sus partes (cobertura_por_partes).
export function avancePonderado(m: MuebleFlujo, indice: number, campo: "entregado" | "asignado" = "entregado"): number {
  const a = avancePaso(m, indice);
  if (a.estado === "terminado" && campo === "entregado") return 100;
  if (m.cantidad <= 0) return 0;
  const proceso = m.ruta[indice]?.proceso;
  const partes = (m.partes ?? []).filter((p) => !proceso || parteLleva(p, proceso));
  if (partes.length === 0) return porcentaje(a[campo], m.cantidad);
  const pesos = pesosPartes(partes);
  let suma = 0;
  for (const p of partes) {
    const x = a.partes[p.id];
    if (!x || x.total <= 0) continue;
    suma += (pesos.get(p.id) ?? 0) * Math.min(1, x[campo] / x.total);
  }
  return Math.max(0, Math.min(100, Math.round(suma)));
}

// Encuadre de un mueble con despiece: cuántos muebles completos se pueden armar con lo que
// ya terminó cada parte y qué le falta a cada una para alcanzar a la más adelantada. Una
// pieza está terminada cuando se entregó en el último paso de la ruta que su parte lleva
// (la tabla en Barniz; el herraje, que no va a Barniz, en Armado). Ej.: 23 muebles, tabla 3
// por mueble con 20 terminadas (6 muebles) y herraje 1 por mueble con 0: 0 completos; para
// los 6 que ya cubre la tabla faltan 6 herrajes. Sin partes, los muebles entregados en el
// último paso. Solo para mostrar.
export interface EncuadreParte {
  id: string;
  // Piezas terminadas de la parte y los muebles completos que alcanzan (hacia abajo).
  terminadas: number;
  muebles: number;
  // Piezas que le faltan para llegar a los muebles de la parte más adelantada.
  faltan: number;
}

export interface Encuadre {
  completos: number;
  // Muebles que cubre la parte más adelantada (a los que se encuadra el faltante).
  meta: number;
  partes: EncuadreParte[];
}

export function encuadreMueble(m: MuebleFlujo): Encuadre {
  const partes = partesDe(m);
  if (partes.length === 0) {
    const ultimo = m.ruta.length - 1;
    const completos = ultimo < 0 ? 0 : Math.min(m.cantidad, Math.floor(avancePaso(m, ultimo).entregado + 1e-9));
    return { completos, meta: completos, partes: [] };
  }
  const datos = partes.map((p) => {
    let ultimo = -1;
    m.ruta.forEach((paso, i) => {
      if (parteLleva(p, paso.proceso)) ultimo = i;
    });
    const e = ultimo < 0 ? null : porParte(normalesDelPaso(m, ultimo), "entregado");
    const terminadas = e ? redondear(e.mueble * p.piezasPorMueble + e.de(p.id)) : 0;
    const muebles = Math.min(m.cantidad, Math.floor(terminadas / p.piezasPorMueble + 1e-9));
    return { p, terminadas, muebles };
  });
  const completos = Math.min(...datos.map((d) => d.muebles));
  const meta = Math.max(...datos.map((d) => d.muebles));
  return {
    completos,
    meta,
    partes: datos.map(({ p, terminadas, muebles }) => ({
      id: p.id,
      terminadas,
      muebles,
      faltan: Math.max(0, redondear(meta * p.piezasPorMueble - terminadas)),
    })),
  };
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
  // Por parte del despiece que lleva el proceso, en piezas (vacío si no tiene partes).
  partes: { id: string; total: number; disponible: number; listo: number }[];
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
      partes: Object.entries(a.partes).map(([id, x]) => ({ id, total: x.total, disponible: x.disponible, listo: x.listo })),
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
