// Bitácora de taller del inicio de Producción: por equipo, qué muebles tiene (o tuvo hace
// poco), cuántos, en qué O.T./PM y si siguen en su taller (palomita) o ya salieron (tache).
// Lógica sin base de datos ni navegador, para poder probarla; la lectura vive en
// bitacora-db.ts.

import { diasEntre, type AsignacionResumen } from "./asignaciones";
import { enTaller, type Plazo } from "./atrasos";
import type { MarcaActual } from "./historial-marcas";
import { claveModelo, type EstadoInicio, type MuebleInicio } from "./inicio";

// Cuántos días atrás se muestra lo que un equipo ya entregó (lo que sigue en taller sale siempre).
export const DIAS_BITACORA = 14;
// Filas por equipo a la vista; las demás están a un clic en las asignaciones del equipo.
export const FILAS_POR_EQUIPO = 6;

export type AsignacionBitacora = Pick<
  AsignacionResumen,
  | "id"
  | "planeacion_item_id"
  | "pedido_id"
  | "numero_pedido"
  | "item_code"
  | "modelo"
  | "unidad"
  | "equipo_id"
  | "equipo"
  | "encargado"
  | "proceso"
  | "cantidad"
  | "entregado"
  | "fecha_asignacion"
  | "estado"
  | "ultima_entrega"
  | "vez_paso"
  | "veces_proceso"
  | "parte_id"
  | "parte_descripcion"
  | "parte_unidad"
>;

export interface FilaBitacora extends AsignacionBitacora {
  // O.T. del PM (null si no se conoce).
  ot: string | null;
  // Lo que el equipo todavía tiene sin entregar; 0 si ya entregó todo.
  tiene: number;
  // La asignación sigue en curso (en proceso o con entrega parcial).
  estaEnTaller: boolean;
  // Palomita (true) o tache (false) que eligió Producción; null si no se ha marcado, y su nota.
  marca: boolean | null;
  nota: string | null;
  diasEnTaller: number;
  plazo: Plazo;
}

export interface GrupoBitacora {
  equipoId: string;
  equipo: string;
  // Encargado de la asignación más reciente del equipo, si lo hay.
  encargado: string | null;
  filas: FilaBitacora[];
  // Cuántas filas siguen en taller (con palomita) y cuántas de ellas van atrasadas.
  enTaller: number;
  atrasadas: number;
}

// "AAAA-MM-DD" de `dias` días antes de `hoy`.
export function restarDias(hoy: string, dias: number): string {
  const f = new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10) - dias));
  return f.toISOString().slice(0, 10);
}

const redondear = (n: number) => Math.round(n * 100) / 100;
const diasAtraso = (f: FilaBitacora) => (f.plazo.tipo === "vencido" ? f.plazo.dias : 0);

// `marcas`: la palomita o el tache elegido de cada asignación (por id) con su nota; sin entrada, sin marcar.
// Agrupa por equipo lo que sigue en taller y lo entregado en los últimos `dias` días. Dentro
// de cada equipo, primero lo que tiene (lo atrasado antes) y después lo que ya entregó (lo
// último entregado antes). Los equipos con algo en taller van primero.
export function armarBitacora(
  asignaciones: AsignacionBitacora[],
  plazos: ReadonlyMap<string, Plazo>,
  ots: ReadonlyMap<string, string | null>,
  hoy: string,
  marcas: ReadonlyMap<string, MarcaActual> = new Map(),
  dias: number = DIAS_BITACORA
): GrupoBitacora[] {
  const desde = restarDias(hoy, dias);
  const porEquipo = new Map<string, GrupoBitacora & { reciente: string }>();

  for (const a of asignaciones) {
    if (a.estado === "cancelada") continue;
    const estaEnTaller = enTaller(a);
    const salida = (a.ultima_entrega ?? a.fecha_asignacion).slice(0, 10);
    if (!estaEnTaller && salida < desde) continue;

    const fila: FilaBitacora = {
      ...a,
      ot: (a.pedido_id && ots.get(a.pedido_id)) || null,
      tiene: estaEnTaller ? Math.max(0, redondear(Number(a.cantidad) - Number(a.entregado))) : 0,
      estaEnTaller,
      marca: marcas.get(a.id)?.esta ?? null,
      nota: marcas.get(a.id)?.nota ?? null,
      diasEnTaller: Math.max(0, diasEntre(a.fecha_asignacion, estaEnTaller ? hoy : salida)),
      plazo: estaEnTaller ? ((a.pedido_id && plazos.get(a.pedido_id)) || { tipo: "sin-fecha" }) : { tipo: "sin-fecha" },
    };

    let g = porEquipo.get(a.equipo_id);
    if (!g) {
      g = { equipoId: a.equipo_id, equipo: a.equipo, encargado: null, filas: [], enTaller: 0, atrasadas: 0, reciente: "" };
      porEquipo.set(a.equipo_id, g);
    }
    g.filas.push(fila);
    if (estaEnTaller) g.enTaller += 1;
    if (estaEnTaller && fila.plazo.tipo === "vencido") g.atrasadas += 1;
    if (a.fecha_asignacion > g.reciente) {
      g.reciente = a.fecha_asignacion;
      g.encargado = a.encargado;
    }
  }

  const grupos = [...porEquipo.values()];
  for (const g of grupos) {
    g.filas.sort((x, y) => {
      if (x.estaEnTaller !== y.estaEnTaller) return x.estaEnTaller ? -1 : 1;
      if (x.estaEnTaller) return diasAtraso(y) - diasAtraso(x) || y.diasEnTaller - x.diasEnTaller;
      return (y.ultima_entrega ?? "").localeCompare(x.ultima_entrega ?? "");
    });
  }
  grupos.sort(
    (x, y) =>
      y.atrasadas - x.atrasadas ||
      y.enTaller - x.enTaller ||
      y.reciente.localeCompare(x.reciente) ||
      x.equipo.localeCompare(y.equipo, "es")
  );
  return grupos;
}

// Reparte la bitácora entre los recuadros de "Muebles recientes": las filas de cada modelo van
// dentro de su recuadro (sin repetir su nombre ni su O.T.) y lo que no coincide con ninguno de
// los modelos a la vista queda en `resto`, agrupado por equipo como antes.
export function repartirBitacora(
  grupos: GrupoBitacora[],
  modelosAVista: string[]
): { porModelo: Record<string, FilaBitacora[]>; resto: GrupoBitacora[] } {
  const claves = new Set(modelosAVista.map((m) => claveModelo(m)));
  const porModelo: Record<string, FilaBitacora[]> = {};
  const resto: GrupoBitacora[] = [];
  for (const g of grupos) {
    const sobran: FilaBitacora[] = [];
    for (const f of g.filas) {
      const clave = claveModelo(f.modelo);
      if (clave && claves.has(clave)) (porModelo[clave] ??= []).push(f);
      else sobran.push(f);
    }
    if (sobran.length > 0) {
      resto.push({
        ...g,
        filas: sobran,
        enTaller: sobran.filter((f) => f.estaEnTaller).length,
        atrasadas: sobran.filter((f) => f.estaEnTaller && f.plazo.tipo === "vencido").length,
      });
    }
  }
  // Dentro de un recuadro, primero lo que sigue en taller (lo atrasado antes) y luego lo entregado.
  for (const filas of Object.values(porModelo)) {
    filas.sort(
      (x, y) =>
        Number(y.estaEnTaller) - Number(x.estaEnTaller) ||
        diasAtraso(y) - diasAtraso(x) ||
        (y.ultima_entrega ?? "").localeCompare(x.ultima_entrega ?? "")
    );
  }
  return { porModelo, resto };
}

// Un mueble (ítem) de un modelo a la vista que no tiene ninguna fila de asignación: también lleva su
// palomita o su tache, para que la bitácora tenga marca en todos los muebles y PM, no solo en los asignados.
export interface FilaSinAsignar {
  itemId: string;
  pedidoId: string;
  numeroPm: string;
  ot: string | null;
  estado: EstadoInicio;
  // Piezas que pide el PM de este mueble (el equipo no tiene ninguna todavía) y su unidad.
  cantidad: number;
  unidad: string | null;
  // Palomita (true) o tache (false) que eligió Producción; null si no se ha marcado, y su nota.
  marca: boolean | null;
  nota: string | null;
}

const ORDEN_ESTADO: Record<EstadoInicio, number> = { por_asignar: 0, en_proceso: 1, por_liberar: 2, terminado: 3 };
const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

// Por modelo (su clave), los muebles que no salen en ninguna fila de `porModelo`. Primero los que
// esperan equipo; dentro de cada estado, por PM.
export function sinAsignarPorModelo(
  muebles: MuebleInicio[],
  porModelo: Record<string, FilaBitacora[]>,
  modelosAVista: string[],
  marcasDeMuebles: ReadonlyMap<string, MarcaActual> = new Map()
): Record<string, FilaSinAsignar[]> {
  const claves = new Set(modelosAVista.map((m) => claveModelo(m)));
  const resultado: Record<string, FilaSinAsignar[]> = {};
  for (const m of muebles) {
    const clave = claveModelo(m.modelo);
    if (!clave || !claves.has(clave)) continue;
    if ((porModelo[clave] ?? []).some((f) => f.planeacion_item_id === m.id)) continue;
    (resultado[clave] ??= []).push({
      itemId: m.id,
      pedidoId: m.pedidoId,
      numeroPm: m.numeroPm,
      ot: m.ot,
      estado: m.estado,
      cantidad: m.cantidad ?? 0,
      unidad: m.unidad ?? null,
      marca: marcasDeMuebles.get(m.id)?.esta ?? null,
      nota: marcasDeMuebles.get(m.id)?.nota ?? null,
    });
  }
  for (const filas of Object.values(resultado)) {
    filas.sort((x, y) => ORDEN_ESTADO[x.estado] - ORDEN_ESTADO[y.estado] || natural(x.numeroPm, y.numeroPm));
  }
  return resultado;
}

// Dirección del panel de asignación para el mueble de una fila: lo que sigue en taller entra
// con el filtro por omisión; lo ya entregado pide "todos" porque el panel oculta lo terminado.
export function hrefAsignarDeFila(f: Pick<FilaBitacora, "numero_pedido" | "estaEnTaller">): string {
  const p = new URLSearchParams();
  if (!f.estaEnTaller) p.set("estado", "todos");
  p.set("q", f.numero_pedido);
  return `/produccion/panel?${p.toString()}`;
}
