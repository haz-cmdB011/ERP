// Por dónde va cada mueble en Producción (Armado, Superficie Sólida, Barniz,
// Electrificación, con pasos que se pueden repetir): lo que pinta el flujo de la pantalla
// de asignaciones. Sin base de datos, para poder probarlo.
//
// Hay dos clases de ruta (migración rutas_por_parte): la de cada parte del despiece (la
// Tabla: Armado → Barniz; el herraje: Armado) y la del mueble completo, con lo que se le
// hace ya armado con sus partes (ensamblarlo es un Armado). Son independientes: agregar
// un paso a una no lo agrega a las otras. Primero van las partes y después el mueble.

import { esRetrabajo, PROCESO_LABELS, PROCESOS, type AsignacionResumen, type Proceso } from "./asignaciones";
import { ORDEN_SUGERIDO as PROCESOS_EN_ORDEN, etiquetaPaso, rutaDeParte, rutaDelMueble, type PasoRuta } from "./ruta";
import type { RutaGuardada } from "./rutas-db";

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
  // La ruta del mueble completo: la guardada o, si aún no tiene, la sugerida (pasos con
  // id null). Con partes puede estar vacía.
  ruta: PasoRuta[];
  // Versión de las rutas del mueble (0 = todavía no se guarda), para el bloqueo
  // optimista de guardar_ruta_produccion. Una sola para el mueble y sus partes.
  versionRuta: number;
  asignaciones: AsignacionResumen[];
  // Revisión final de Calidad: piezas que ya aprobó. null u omitido si la
  // revisión final está apagada (ajuste revision_final).
  revisionFinal?: { aprobadas: number } | null;
  // Partes vigentes de su despiece (migración despiece_por_partes), cada una con su ruta.
  // Omitido si la pantalla no las leyó.
  partes?: ParteMueble[];
  // Tiene componentes vigentes en el PM: entonces, sin despiece guardado, no se asigna
  // (requiere_despiece en la base). Omitido = no se sabe.
  conComponentes?: boolean;
  // Dónde se hace su despiece (null u omitido si la pantalla no lo sabe).
  despieceHref?: string | null;
}

// Una parte del despiece, tal como sale de la base (sin su ruta).
export interface ParteDespiece {
  id: string;
  descripcion: string;
  piezasPorMueble: number;
  unidad: string | null;
  // % del mueble que vale (todas suman 100). null: las partes valen lo mismo.
  porcentaje?: number | null;
  // Ya guardó su ruta (aunque sea vacía). Si no, usa la sugerida.
  rutaGuardada?: boolean;
}

// Una parte del despiece con su ruta: la guardada o la sugerida (pasos con id null).
export interface ParteMueble extends ParteDespiece {
  ruta: PasoRuta[];
}

// La ruta del mueble y la de cada parte, a partir de lo guardado (cargarRutas) y el
// despiece (cargarPartes). Mismo criterio que asegurar_ruta_produccion.
export function rutasDelFlujo(
  guardada: RutaGuardada | undefined,
  aplica: Record<Proceso, boolean>,
  partes: ParteDespiece[]
): { ruta: PasoRuta[]; partes: ParteMueble[] } {
  return {
    ruta: rutaDelMueble(guardada?.pasos, aplica, partes.length > 0),
    partes: partes.map((p) => ({
      ...p,
      ruta: rutaDeParte(guardada?.partes.get(p.id), !!p.rutaGuardada, aplica),
    })),
  };
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

// Las partes que tienen algún paso en su ruta: las que el mueble espera.
export function partesConRuta(m: MuebleFlujo): ParteMueble[] {
  return (m.partes ?? []).filter((p) => p.ruta.length > 0);
}

// El % del mueble que vale cada parte: el guardado o, si falta en alguna, partes iguales.
export function pesosPartes(partes: ParteDespiece[]): Map<string, number> {
  const completos = partes.length > 0 && partes.every((p) => p.porcentaje != null);
  const total = completos ? partes.reduce((s, p) => s + Number(p.porcentaje), 0) : 0;
  return new Map(
    partes.map((p) => [p.id, completos && total > 0 ? (Number(p.porcentaje) / total) * 100 : 100 / partes.length])
  );
}

// Con la revisión final encendida, un mueble con toda su ruta terminada todavía
// espera a Calidad; sale a obra cuando la revisión final aprueba su cantidad.
// null: la revisión final está apagada.
export function estadoObra(m: MuebleFlujo): "liberado" | "en_revision_final" | null {
  if (!m.revisionFinal) return null;
  return m.revisionFinal.aprobadas >= m.cantidad ? "liberado" : "en_revision_final";
}

// Cómo va un paso. El mueble completo va en muebles; una parte, en sus piezas.
export interface AvancePaso {
  estado: EstadoProceso;
  // Lo que lleva el paso: la cantidad del mueble o las piezas de la parte (por mueble ×
  // cantidad).
  total: number;
  asignado: number;
  entregado: number;
  // Lo que falta por asignar en este paso.
  disponible: number;
  // Lo que se puede asignar sin adelantarse al paso anterior: lo que ese paso ya entregó y
  // Producción verificó, menos lo ya asignado aquí. El primer paso del mueble completo va
  // detrás de sus partes; el primero de una parte, sin nada antes, es todo lo disponible.
  listo: number;
  // Piezas que Calidad rechazó en los lotes del paso y nadie ha reasignado:
  // mientras haya, el paso no está terminado.
  porReasignar: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;
// En muebles, con dos decimales hacia abajo (mismo criterio que la base: trunc).
const truncar = (n: number) => Math.floor(n * 100 + 1e-9) / 100;

// La ruta de un dueño: la del mueble completo (null) o la de una parte.
const rutaDe = (m: MuebleFlujo, parte: ParteMueble | null) => (parte ? parte.ruta : m.ruta);

// En qué paso de la ruta de su dueño va cada asignación: el suyo (paso_id) o, si no está
// en la ruta (ruta sin guardar, paso quitado), el primero de su mismo proceso.
export function pasoDeAsignacion(ruta: PasoRuta[], a: AsignacionResumen): number {
  const porId = a.paso_id ? ruta.findIndex((p) => p.id === a.paso_id) : -1;
  if (porId >= 0) return porId;
  return ruta.findIndex((p) => p.proceso === a.proceso);
}

// Las asignaciones de un paso de la ruta del mueble completo (parte omitida o null) o de
// una parte, incluidas las canceladas y los retrabajos.
export function asignacionesDelPaso(
  m: MuebleFlujo,
  indice: number,
  parte: ParteMueble | null = null
): AsignacionResumen[] {
  const ruta = rutaDe(m, parte);
  return m.asignaciones.filter(
    (a) => (a.parte_id ?? null) === (parte?.id ?? null) && pasoDeAsignacion(ruta, a) === indice
  );
}

// Un paso con asignaciones vigentes no se puede quitar de la ruta.
export function pasoConAsignaciones(m: MuebleFlujo, indice: number, parte: ParteMueble | null = null): boolean {
  return asignacionesDelPaso(m, indice, parte).some((a) => !a.cancelada_en);
}

type Campo = "cantidad" | "entregado" | "verificado";

// Sin canceladas ni retrabajos: lo que cuenta contra el tope del paso.
function normalesDelPaso(m: MuebleFlujo, indice: number, parte: ParteMueble | null): AsignacionResumen[] {
  return asignacionesDelPaso(m, indice, parte).filter((a) => !a.cancelada_en && !esRetrabajo(a));
}

const suma = (lista: AsignacionResumen[], campo: Campo) =>
  redondear(lista.reduce((s, a) => s + Number(a[campo] ?? 0), 0));

// Muebles completos que alcanzan las partes: la más atrasada con lo de `campo` en el
// último paso de su ruta, pasado a muebles. null si ninguna parte tiene ruta. Espejo de
// muebles_por_partes en la base.
export function partesCompletas(m: MuebleFlujo, campo: Campo = "entregado"): number | null {
  const partes = partesConRuta(m);
  if (partes.length === 0) return null;
  return Math.min(
    ...partes.map((p) => truncar(suma(normalesDelPaso(m, p.ruta.length - 1, p), campo) / p.piezasPorMueble))
  );
}

// Asignado, entregado y lo que queda de un paso. El retrabajo no cuenta contra el tope,
// pero mientras siga abierto (o haya rechazos de Calidad sin reasignar) el paso no está
// terminado. Mismo cálculo que crear_asignacion_produccion (tope y `adelantada`).
export function avanceEnRuta(m: MuebleFlujo, indice: number, parte: ParteMueble | null = null): AvancePaso {
  const total = parte ? redondear(m.cantidad * parte.piezasPorMueble) : m.cantidad;
  const delPaso = asignacionesDelPaso(m, indice, parte).filter((a) => !a.cancelada_en);
  const normales = delPaso.filter((a) => !esRetrabajo(a));
  const porReasignar = redondear(delPaso.reduce((s, a) => s + Number(a.rechazado_por_reasignar ?? 0), 0));
  const asignado = suma(normales, "cantidad");
  const entregado = suma(normales, "entregado");
  const disponible = Math.max(0, redondear(total - asignado));

  // Lo que el paso anterior ya verificó: el anterior de la misma ruta; el primero del
  // mueble completo, lo que alcanzan sus partes.
  const antes =
    indice > 0
      ? suma(normalesDelPaso(m, indice - 1, parte), "verificado")
      : parte
        ? null
        : partesCompletas(m, "verificado");
  const listo = antes === null ? disponible : Math.min(disponible, Math.max(0, redondear(antes - asignado)));

  let estado: EstadoProceso;
  if (normales.length === 0) estado = "sin_asignar";
  else {
    const retrabajoAbierto = delPaso.some((a) => esRetrabajo(a) && a.estado !== "entregada");
    estado = entregado >= total && !retrabajoAbierto && porReasignar <= 0 ? "terminado" : "en_proceso";
  }
  return { estado, total, asignado, entregado, disponible, listo, porReasignar };
}

// Un paso de la ruta del mueble completo.
export function avancePaso(m: MuebleFlujo, indice: number): AvancePaso {
  return avanceEnRuta(m, indice, null);
}

// Las partes juntas, como una etapa antes de la ruta del mueble: su estado y su avance en %
// del mueble (cada parte pesa su %, y en cada parte cuenta cada paso de su ruta por igual).
// null si ninguna parte tiene ruta. Solo para mostrar: el cobro y la revisión final cuentan
// un mueble cuando todas sus partes (muebles_por_partes).
export interface AvancePartes {
  estado: EstadoProceso;
  pct: number;
  // Muebles completos que alcanzan con lo entregado en el último paso de cada parte.
  completas: number;
  porReasignar: number;
}

export function avancePartes(m: MuebleFlujo): AvancePartes | null {
  const partes = partesConRuta(m);
  if (partes.length === 0) return null;
  const pesos = pesosPartes(partes);
  let pct = 0;
  let porReasignar = 0;
  const estados: EstadoProceso[] = [];
  for (const p of partes) {
    let avance = 0;
    p.ruta.forEach((_, i) => {
      const a = avanceEnRuta(m, i, p);
      estados.push(a.estado);
      porReasignar += a.porReasignar;
      avance += a.estado === "terminado" ? 1 : a.total > 0 ? Math.min(1, a.entregado / a.total) : 0;
    });
    pct += ((pesos.get(p.id) ?? 0) * avance) / p.ruta.length;
  }
  const estado: EstadoProceso = estados.every((e) => e === "terminado")
    ? "terminado"
    : estados.every((e) => e === "sin_asignar")
      ? "sin_asignar"
      : "en_proceso";
  return {
    estado,
    pct: estado === "terminado" ? 100 : Math.max(0, Math.min(99, Math.round(pct))),
    completas: Math.min(m.cantidad, Math.floor((partesCompletas(m) ?? 0) + 1e-9)),
    porReasignar: redondear(porReasignar),
  };
}

// Avance de un paso en % (0–100) de lo que lleva.
export function avancePonderado(m: MuebleFlujo, indice: number, parte: ParteMueble | null = null): number {
  const a = avanceEnRuta(m, indice, parte);
  return a.estado === "terminado" ? 100 : porcentaje(a.entregado, a.total);
}

// Encuadre de un mueble con despiece: cuántos muebles completos se pueden armar con lo que
// ya terminó cada parte y qué le falta a cada una para alcanzar a la más adelantada. Una
// pieza está terminada cuando se entregó en el último paso de la ruta de su parte (la
// tabla en Barniz; el herraje, que solo va a Armado, en Armado). Ej.: 23 muebles, tabla 3
// por mueble con 20 terminadas (6 muebles) y herraje 1 por mueble con 0: 0 completos; para
// los 6 que ya cubre la tabla faltan 6 herrajes. Sin partes, los muebles entregados en el
// último paso del mueble. Solo para mostrar.
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
  const partes = partesConRuta(m);
  if (partes.length === 0) {
    const ultimo = m.ruta.length - 1;
    const completos = ultimo < 0 ? 0 : Math.min(m.cantidad, Math.floor(avancePaso(m, ultimo).entregado + 1e-9));
    return { completos, meta: completos, partes: [] };
  }
  const datos = partes.map((p) => {
    const terminadas = suma(normalesDelPaso(m, p.ruta.length - 1, p), "entregado");
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

// Un paso de una ruta, tal como se ofrece en el formulario de asignación.
export interface OpcionPaso {
  // Posición en su ruta (0 = primer paso).
  indice: number;
  // null mientras la ruta sea la sugerida y no se haya guardado: la base usa el
  // paso de ese proceso.
  id: string | null;
  proceso: Proceso;
  etiqueta: string;
  // Lo que falta por asignar en el paso (en muebles o, de una parte, en sus piezas).
  disponible: number;
  // Lo que ya entregó el paso anterior y aún no se asigna aquí.
  listo: number;
  // Qué va antes (el paso anterior o, en el primero del mueble con partes, "las partes");
  // null si nada.
  anterior: string | null;
}

// Los pasos de la ruta del mueble completo (parte null) o de una parte como opciones del
// formulario de asignación.
export function opcionesDePasos(m: MuebleFlujo, parte: ParteMueble | null = null): OpcionPaso[] {
  const ruta = rutaDe(m, parte);
  const conPartes = !parte && partesConRuta(m).length > 0;
  return ruta.map((p, i) => {
    const a = avanceEnRuta(m, i, parte);
    return {
      indice: i,
      id: p.id,
      proceso: p.proceso,
      etiqueta: etiquetaPaso(ruta, i),
      disponible: a.disponible,
      listo: a.listo,
      anterior: i > 0 ? etiquetaPaso(ruta, i - 1) : conPartes ? "Las partes" : null,
    };
  });
}

// Lo que se puede asignar de un mueble: la ruta del mueble completo y la de cada parte.
export interface RutasAsignar {
  mueble: OpcionPaso[];
  partes: { parte: ParteMueble; pasos: OpcionPaso[] }[];
}

export function opcionesAsignar(m: MuebleFlujo): RutasAsignar {
  return {
    mueble: opcionesDePasos(m),
    partes: (m.partes ?? []).map((p) => ({ parte: p, pasos: opcionesDePasos(m, p) })),
  };
}

// Lo que toca asignar: si van las partes, el primer paso con lugar de la primera parte que
// lo tenga; si ya va el mueble completo, su paso siguiente. Si eso ya está asignado, lo
// primero que todavía tenga lugar. null si ya está asignado todo.
export function siguienteAsignable(
  m: MuebleFlujo
): { parte: ParteMueble | null; paso: OpcionPaso } | null {
  const deMueble = opcionesDePasos(m).map((paso) => ({ parte: null, paso }));
  const dePartes = (m.partes ?? []).flatMap((parte) => opcionesDePasos(m, parte).map((paso) => ({ parte, paso })));
  const i = indiceSiguiente(m);
  const preferidas = etapaSiguiente(m)?.tipo === "partes" ? dePartes : deMueble.filter((x) => x.paso.indice === i);
  const libre = (x: { paso: OpcionPaso }) => x.paso.disponible > 0;
  return preferidas.find(libre) ?? dePartes.find(libre) ?? deMueble.find(libre) ?? null;
}

// Una columna del flujo de un mueble con despiece: un proceso y qué vez es (el 2º Armado de
// una ruta va en "Armado 2"). Junta ese paso de todas las rutas que lo llevan (cada parte y
// el mueble completo), para ver de un vistazo cómo va cada proceso.
export interface ColumnaProceso {
  proceso: Proceso;
  vez: number;
  etiqueta: string;
}

// El índice del paso de la ruta que cae en la columna (-1 si esa ruta no lo lleva).
export function pasoEnColumna(ruta: PasoRuta[], c: { proceso: Proceso; vez: number }): number {
  let n = 0;
  return ruta.findIndex((p) => p.proceso === c.proceso && ++n === c.vez);
}

// Las columnas de un mueble: cada proceso y vez que lleva alguna de sus rutas, en el orden
// sugerido (Armado, S.S., Barniz, Electrificación).
export function columnasMueble(m: MuebleFlujo): ColumnaProceso[] {
  const rutas = [m.ruta, ...partesConRuta(m).map((p) => p.ruta)];
  return PROCESOS_EN_ORDEN.flatMap((proceso) => {
    const veces = Math.max(0, ...rutas.map((r) => r.filter((p) => p.proceso === proceso).length));
    return Array.from({ length: veces }, (_, i) => ({
      proceso,
      vez: i + 1,
      etiqueta: veces > 1 ? `${PROCESO_LABELS[proceso]} ${i + 1}` : PROCESO_LABELS[proceso],
    }));
  });
}

// Cómo va una columna: su avance en % (cada parte pesa su % del mueble y el mueble completo,
// si también la lleva, pesa lo mismo que todas las partes juntas), su estado y los muebles
// completos que alcanzan (lo más atrasado). Solo para mostrar.
export function avanceColumna(m: MuebleFlujo, c: ColumnaProceso) {
  const partes = partesConRuta(m).filter((p) => pasoEnColumna(p.ruta, c) >= 0);
  const pesos = pesosPartes(partes);
  const dueños = [
    ...partes.map((p) => ({ parte: p as ParteMueble | null, peso: pesos.get(p.id) ?? 0, i: pasoEnColumna(p.ruta, c) })),
    ...(pasoEnColumna(m.ruta, c) >= 0 ? [{ parte: null, peso: partes.length > 0 ? 100 : 1, i: pasoEnColumna(m.ruta, c) }] : []),
  ];
  let suma = 0;
  let pesoTotal = 0;
  let porReasignar = 0;
  let muebles = m.cantidad;
  const estados: EstadoProceso[] = [];
  for (const d of dueños) {
    const a = avanceEnRuta(m, d.i, d.parte);
    estados.push(a.estado);
    porReasignar += a.porReasignar;
    suma += d.peso * (a.estado === "terminado" ? 1 : a.total > 0 ? Math.min(1, a.entregado / a.total) : 0);
    pesoTotal += d.peso;
    muebles = Math.min(muebles, truncar(a.entregado / (d.parte?.piezasPorMueble ?? 1)));
  }
  const estado: EstadoProceso =
    estados.length === 0 || estados.every((e) => e === "terminado")
      ? "terminado"
      : estados.every((e) => e === "sin_asignar")
        ? "sin_asignar"
        : "en_proceso";
  return {
    estado,
    pct: estado === "terminado" ? 100 : Math.min(99, Math.round(pesoTotal > 0 ? (100 * suma) / pesoTotal : 0)),
    porReasignar: redondear(porReasignar),
    muebles: Math.max(0, muebles),
  };
}

// Por dónde va el mueble: las partes (si tienen ruta) y después cada paso del mueble.
export type Etapa = { tipo: "partes" } | { tipo: "paso"; indice: number };

export function etapasMueble(m: MuebleFlujo): Etapa[] {
  return [
    ...(partesConRuta(m).length > 0 ? [{ tipo: "partes" } as const] : []),
    ...m.ruta.map((_, indice) => ({ tipo: "paso", indice }) as const),
  ];
}

export function estadoEtapa(m: MuebleFlujo, e: Etapa): EstadoProceso {
  return e.tipo === "partes" ? (avancePartes(m)?.estado ?? "terminado") : avancePaso(m, e.indice).estado;
}

// El estado del mueble completo, para filtrar.
export type EstadoMueble = "por_asignar" | "en_proceso" | "terminado";

export function estadoMueble(m: MuebleFlujo): EstadoMueble {
  const estados = etapasMueble(m).map((e) => estadoEtapa(m, e));
  if (estados.length > 0 && estados.every((e) => e === "terminado")) return "terminado";
  if (estados.some((e) => e === "en_proceso")) return "en_proceso";
  return "por_asignar";
}

// La primera etapa que no está terminada (null si ya terminó todo).
export function etapaSiguiente(m: MuebleFlujo): Etapa | null {
  return etapasMueble(m).find((e) => estadoEtapa(m, e) !== "terminado") ?? null;
}

// Índice del primer paso del mueble completo que no está terminado, si ya le toca (las
// partes terminaron); null si todavía van las partes o ya terminó todo.
export function indiceSiguiente(m: MuebleFlujo): number | null {
  const e = etapaSiguiente(m);
  return e?.tipo === "paso" ? e.indice : null;
}

// A dónde va el mueble: la primera etapa que no está terminada.
export function siguientePaso(m: MuebleFlujo): string {
  const e = etapaSiguiente(m);
  if (!e) return "Terminado";
  if (e.tipo === "partes") {
    // El primer proceso de las partes que no ha terminado.
    const soloPartes: MuebleFlujo = { ...m, ruta: [] };
    const c = columnasMueble(soloPartes).find((x) => avanceColumna(soloPartes, x).estado !== "terminado");
    if (c) {
      return avanceColumna(soloPartes, c).estado === "sin_asignar" ? `Asignar a ${c.etiqueta}` : `En ${c.etiqueta}`;
    }
  }
  const etiqueta = e.tipo === "partes" ? "partes" : etiquetaPaso(m.ruta, e.indice);
  return estadoEtapa(m, e) === "sin_asignar" ? `Asignar a ${etiqueta}` : `En ${etiqueta}`;
}

// Piezas terminadas contra piezas que lleva el proceso, en muebles, sumando los muebles
// que lo llevan. Un proceso cuenta cada vez: cada paso del mueble que lo lleva y cada vez
// que lo lleva alguna parte (la 1ª vez de Armado de todas sus partes cuenta lo de la más
// atrasada). Mismo criterio que el cobro (cobertura_partes_vez).
export function totalesProceso(muebles: MuebleFlujo[], p: Proceso) {
  let piezas = 0;
  let asignado = 0;
  let entregado = 0;
  let conProceso = 0;
  for (const m of muebles) {
    let lleva = false;
    const sumar = (a: number, e: number) => {
      lleva = true;
      piezas += m.cantidad;
      asignado += Math.min(a, m.cantidad);
      entregado += Math.min(e, m.cantidad);
    };
    m.ruta.forEach((paso, i) => {
      if (paso.proceso !== p) return;
      const a = avancePaso(m, i);
      sumar(a.asignado, a.entregado);
    });
    // Por vez del proceso en las partes: el paso de cada parte que lo lleva esa vez.
    const veces = partesConRuta(m).map((parte) => ({
      parte,
      indices: parte.ruta.flatMap((x, j) => (x.proceso === p ? [j] : [])),
    }));
    for (let vez = 0; ; vez++) {
      const conVez = veces.flatMap(({ parte, indices }) =>
        vez < indices.length ? [{ parte, a: avanceEnRuta(m, indices[vez], parte) }] : []
      );
      if (conVez.length === 0) break;
      const enMuebles = (campo: "asignado" | "entregado") =>
        Math.min(...conVez.map(({ parte, a }) => truncar(a[campo] / parte.piezasPorMueble)));
      sumar(enMuebles("asignado"), enMuebles("entregado"));
    }
    if (lleva) conProceso += 1;
  }
  return {
    muebles: conProceso,
    piezas: redondear(piezas),
    asignado: redondear(asignado),
    entregado: redondear(entregado),
  };
}

// Los procesos que lleva algún mueble, en su ruta o en la de alguna parte.
export function procesosDe(muebles: MuebleFlujo[]): Set<Proceso> {
  const s = new Set<Proceso>();
  for (const m of muebles) {
    for (const p of m.ruta) s.add(p.proceso);
    for (const parte of m.partes ?? []) for (const p of parte.ruta) s.add(p.proceso);
  }
  return s;
}

// 0–100, para las barras.
export function porcentaje(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((parte / total) * 100)));
}

// Por proceso, lo que falta por asignar en el primer paso de ese proceso de la ruta del
// mueble completo que aún tiene lugar (el mismo que elige crear_asignacion_produccion
// cuando no se le dice el paso) y cuánto de eso ya entregó el paso anterior. Lo que la
// ruta no lleva queda en 0. Solo para los muebles que se asignan completos.
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
