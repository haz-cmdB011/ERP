// Plazos y atrasos del taller. La fecha de referencia es la de entrega del PM
// (la única fecha comprometida que existe: las asignaciones no tienen una
// propia). Una asignación "en taller" (en proceso o con entrega parcial) cuyo
// PM ya pasó su fecha de entrega está atrasada; las entregadas o canceladas
// nunca lo están. Para las O.T. la fecha pasada solo se marca como atraso si
// aún queda trabajo (ítems por liberar o asignaciones en taller): no existe un
// estado "entregado" del pedido, así que sin trabajo pendiente se queda como
// "Fecha pasada" (ver lib/resumen/entrega.ts).

import { diasEntre, type AsignacionResumen } from "./asignaciones";

// Cuántos días antes de la fecha se avisa que "vence pronto".
export const DIAS_POR_VENCER = 7;

export type Plazo =
  | { tipo: "sin-fecha" }
  | { tipo: "vencido"; dias: number } // días de atraso (1 o más)
  | { tipo: "hoy" }
  | { tipo: "por-vencer"; dias: number } // días que faltan (1 a DIAS_POR_VENCER)
  | { tipo: "a-tiempo"; dias: number };

// `fecha` y `hoy` como "AAAA-MM-DD" (se ignora la hora si viene).
export function plazoDePedido(fecha: string | null | undefined, hoy: string): Plazo {
  const limpia = fecha?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpia)) return { tipo: "sin-fecha" };
  const faltan = diasEntre(hoy, limpia);
  if (Number.isNaN(faltan)) return { tipo: "sin-fecha" };
  if (faltan < 0) return { tipo: "vencido", dias: -faltan };
  if (faltan === 0) return { tipo: "hoy" };
  if (faltan <= DIAS_POR_VENCER) return { tipo: "por-vencer", dias: faltan };
  return { tipo: "a-tiempo", dias: faltan };
}

// Texto corto para la etiqueta; null si no hay nada que avisar.
export function textoPlazo(plazo: Plazo): string | null {
  switch (plazo.tipo) {
    case "vencido":
      return `Atrasada ${plazo.dias} d`;
    case "hoy":
      return "Vence hoy";
    case "por-vencer":
      return `Vence en ${plazo.dias} d`;
    default:
      return null;
  }
}

export function esAlerta(plazo: Plazo): boolean {
  return plazo.tipo === "vencido" || plazo.tipo === "hoy" || plazo.tipo === "por-vencer";
}

// Asignaciones que siguen en el taller.
export function enTaller(a: Pick<AsignacionResumen, "estado">): boolean {
  return a.estado === "en_proceso" || a.estado === "parcial";
}

// Lo que el tablero necesita de cada asignación en taller.
export type AsignacionTaller = Pick<
  AsignacionResumen,
  | "id"
  | "pedido_id"
  | "numero_pedido"
  | "item_code"
  | "modelo"
  | "descripcion"
  | "unidad"
  | "equipo_id"
  | "equipo"
  | "proceso"
  | "cantidad"
  | "entregado"
  | "fecha_asignacion"
  | "estado"
>;

export interface FilaTaller extends AsignacionTaller {
  pendiente: number;
  diasEnTaller: number;
  plazo: Plazo;
}

export interface ResumenEquipo {
  equipoId: string;
  equipo: string;
  filas: FilaTaller[]; // atrasadas primero, luego las más antiguas
  atrasadas: number;
  porVencer: number;
  pedidos: number; // PM distintos
  masAntigua: number; // días de la asignación más antigua
}

export interface ResumenTaller {
  equipos: ResumenEquipo[]; // con más atraso primero
  atrasadas: FilaTaller[]; // todas, la más atrasada primero
  total: number;
  porVencer: number;
}

// Agrupa las asignaciones en taller por equipo. `plazos` trae el plazo de cada
// PM (por id de pedido); un PM sin entrada se trata como sin fecha.
export function resumirTaller(
  asignaciones: AsignacionTaller[],
  plazos: ReadonlyMap<string, Plazo>,
  hoy: string
): ResumenTaller {
  const porEquipo = new Map<string, ResumenEquipo>();
  const atrasadas: FilaTaller[] = [];
  let total = 0;
  let porVencer = 0;

  for (const a of asignaciones) {
    if (!enTaller(a)) continue;
    const plazo: Plazo = (a.pedido_id && plazos.get(a.pedido_id)) || { tipo: "sin-fecha" };
    const fila: FilaTaller = {
      ...a,
      pendiente: Math.round((Number(a.cantidad) - Number(a.entregado)) * 100) / 100,
      diasEnTaller: Math.max(0, diasEntre(a.fecha_asignacion, hoy)),
      plazo,
    };
    total += 1;
    if (plazo.tipo === "vencido") atrasadas.push(fila);
    if (plazo.tipo === "hoy" || plazo.tipo === "por-vencer") porVencer += 1;

    let equipo = porEquipo.get(a.equipo_id);
    if (!equipo) {
      equipo = {
        equipoId: a.equipo_id,
        equipo: a.equipo,
        filas: [],
        atrasadas: 0,
        porVencer: 0,
        pedidos: 0,
        masAntigua: 0,
      };
      porEquipo.set(a.equipo_id, equipo);
    }
    equipo.filas.push(fila);
    if (plazo.tipo === "vencido") equipo.atrasadas += 1;
    if (plazo.tipo === "hoy" || plazo.tipo === "por-vencer") equipo.porVencer += 1;
    equipo.masAntigua = Math.max(equipo.masAntigua, fila.diasEnTaller);
  }

  const diasAtraso = (f: FilaTaller) => (f.plazo.tipo === "vencido" ? f.plazo.dias : 0);
  const equipos = [...porEquipo.values()];
  for (const e of equipos) {
    e.pedidos = new Set(e.filas.map((f) => f.pedido_id ?? f.numero_pedido)).size;
    e.filas.sort((x, y) => diasAtraso(y) - diasAtraso(x) || y.diasEnTaller - x.diasEnTaller);
  }
  equipos.sort(
    (x, y) =>
      y.atrasadas - x.atrasadas ||
      y.porVencer - x.porVencer ||
      y.filas.length - x.filas.length ||
      x.equipo.localeCompare(y.equipo, "es")
  );
  atrasadas.sort((x, y) => diasAtraso(y) - diasAtraso(x) || y.diasEnTaller - x.diasEnTaller);

  return { equipos, atrasadas, total, porVencer };
}

// Para la lista de O.T.: ¿queda trabajo? (ítems por liberar o asignaciones en
// taller). Solo entonces una fecha vencida cuenta como atraso.
export function otConPendientes(porLiberar: number, asignacionesEnTaller: number): boolean {
  return porLiberar > 0 || asignacionesEnTaller > 0;
}
