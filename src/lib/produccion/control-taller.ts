// Lista de control de la bitácora de taller: todos los muebles y asignaciones en un solo renglón
// cada uno, con su palomita o tache (o sin marcar), para recorrerlos, filtrarlos y llevarlos a
// Excel. Sin base de datos ni navegador, para poder probarlo; la lectura vive en control-taller-db.ts.

import { etiquetaProceso } from "./asignaciones";
import type { FilaBitacora, GrupoBitacora } from "./bitacora";
import { diaMexico, type EventoMarca } from "./historial-marcas";
import type { EstadoInicio, MuebleInicio, ProcesoAvance } from "./inicio";

export type FiltroMarca = "todas" | "no" | "sin" | "si";

export const FILTROS_MARCA: { valor: FiltroMarca; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "no", etiqueta: "No está" },
  { valor: "sin", etiqueta: "Sin marcar" },
  { valor: "si", etiqueta: "Sí está" },
];

export function leerFiltroMarca(valor: string | undefined): FiltroMarca {
  return FILTROS_MARCA.find((f) => f.valor === valor)?.valor ?? "todas";
}

// Tope de renglones en pantalla: el Excel baja todos.
export const MAX_RENGLONES_CONTROL = 400;

const ESTADO_MUEBLE: Record<EstadoInicio, string> = {
  por_liberar: "Por liberar",
  por_asignar: "Por asignar",
  en_proceso: "En proceso",
  terminado: "Terminado",
};

export interface RenglonControl {
  // asignacion:<id> o mueble:<id>
  clave: string;
  asignacionId: string | null;
  itemId: string | null;
  modelo: string;
  numeroPm: string;
  pedidoId: string | null;
  ot: string | null;
  // null = ningún equipo lo tiene (renglón de un mueble sin asignación).
  equipo: string | null;
  proceso: string | null;
  // En taller / Entregada (asignación) o el estado del mueble (por liberar, por asignar…).
  estado: string;
  cantidad: number;
  unidad: string | null;
  // Lo que el equipo tiene sin entregar (0 si no tiene nada).
  tiene: number;
  marca: boolean | null;
  nota: string | null;
  // El mueble sigue por liberar: su botón lleva al pedido y no al panel.
  porLiberar: boolean;
  // El mueble de la tarjeta (el de la asignación o el mismo): de ahí sale su imagen.
  planeacionItemId: string | null;
  // Lo último que le pasó (ISO o día, "" si no se sabe): ordena lo más reciente primero.
  reciente: string;
  // Estado del mueble (null en una asignación) y si la asignación sigue en taller.
  estadoInicio: EstadoInicio | null;
  enTaller: boolean;
  // Lo que el equipo ya entregó de la asignación, los días que lleva en taller y su última entrega.
  entregado: number;
  diasEnTaller: number;
  ultimaEntrega: string | null;
  // Cómo va cada proceso del mueble (vacío si no se sabe).
  procesos: ProcesoAvance[];
}

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
// Primero lo que no está (tache), después lo que falta por marcar y al final lo que sí está.
const ordenMarca = (m: boolean | null) => (m === false ? 0 : m === null ? 1 : 2);

// Un renglón por asignación a la vista y uno por cada mueble que no sale en ninguna asignación.
export function armarControl(
  muebles: MuebleInicio[],
  grupos: GrupoBitacora[],
  marcasDeMuebles: ReadonlyMap<string, { esta: boolean; nota: string | null }> = new Map()
): RenglonControl[] {
  const renglones: RenglonControl[] = [];
  const conFila = new Set<string>();
  const procesosPorMueble = new Map(muebles.map((m) => [m.id, m.procesos ?? []]));

  for (const g of grupos) {
    for (const f of g.filas) {
      if (f.planeacion_item_id) conFila.add(f.planeacion_item_id);
      renglones.push(renglonDeAsignacion(f, procesosPorMueble.get(f.planeacion_item_id ?? "") ?? []));
    }
  }
  for (const m of muebles) {
    if (conFila.has(m.id)) continue;
    renglones.push(renglonDeMueble(m, marcasDeMuebles));
  }

  return renglones.sort(
    (x, y) =>
      ordenMarca(x.marca) - ordenMarca(y.marca) ||
      natural(x.ot ?? "", y.ot ?? "") ||
      natural(x.numeroPm, y.numeroPm) ||
      natural(x.modelo, y.modelo)
  );
}

// Los renglones del tablero: las asignaciones que siguen en taller y todos los muebles liberados que
// esperan equipo, aunque ya tengan un proceso entregado (el que sigue está por asignar).
export function renglonesDeTablero(
  muebles: MuebleInicio[],
  grupos: GrupoBitacora[],
  marcasDeMuebles: ReadonlyMap<string, { esta: boolean; nota: string | null }> = new Map()
): RenglonControl[] {
  const procesosPorMueble = new Map(muebles.map((m) => [m.id, m.procesos ?? []]));
  return [
    ...grupos.flatMap((g) =>
      g.filas
        .filter((f) => f.estaEnTaller)
        .map((f) => renglonDeAsignacion(f, procesosPorMueble.get(f.planeacion_item_id ?? "") ?? []))
    ),
    ...muebles.filter((m) => m.estado === "por_asignar").map((m) => renglonDeMueble(m, marcasDeMuebles)),
  ];
}

function renglonDeMueble(
  m: MuebleInicio,
  marcasDeMuebles: ReadonlyMap<string, { esta: boolean; nota: string | null }>
): RenglonControl {
  return {
    clave: `mueble:${m.id}`,
    asignacionId: null,
    itemId: m.id,
    modelo: m.modelo ?? "Sin modelo",
    numeroPm: m.numeroPm,
    pedidoId: m.pedidoId,
    ot: m.ot,
    equipo: null,
    proceso: null,
    estado: ESTADO_MUEBLE[m.estado],
    cantidad: m.cantidad ?? 0,
    unidad: m.unidad ?? null,
    tiene: 0,
    marca: marcasDeMuebles.get(m.id)?.esta ?? null,
    nota: marcasDeMuebles.get(m.id)?.nota ?? null,
    porLiberar: m.estado === "por_liberar",
    planeacionItemId: m.id,
    reciente: m.actividad ?? m.creadoEn ?? "",
    estadoInicio: m.estado,
    enTaller: false,
    entregado: 0,
    diasEnTaller: 0,
    ultimaEntrega: null,
    procesos: [],
  };
}

function renglonDeAsignacion(f: FilaBitacora, procesos: ProcesoAvance[]): RenglonControl {
  return {
    clave: `asignacion:${f.id}`,
    asignacionId: f.id,
    itemId: null,
    modelo: f.modelo ?? `Ítem ${f.item_code}`,
    numeroPm: f.numero_pedido,
    pedidoId: f.pedido_id,
    ot: f.ot,
    equipo: f.equipo,
    proceso: etiquetaProceso(f),
    estado: f.estaEnTaller ? "En taller" : "Entregada",
    cantidad: Number(f.cantidad),
    unidad: (f.parte_id ? (f.parte_unidad ?? f.unidad) : f.unidad) ?? null,
    tiene: f.tiene,
    marca: f.marca,
    nota: f.nota,
    porLiberar: false,
    planeacionItemId: f.planeacion_item_id ?? null,
    reciente: f.ultima_entrega ?? f.fecha_asignacion ?? "",
    estadoInicio: null,
    enTaller: f.estaEnTaller,
    entregado: Number(f.entregado),
    diasEnTaller: f.diasEnTaller,
    ultimaEntrega: f.ultima_entrega ?? null,
    procesos,
  };
}

// Búsqueda sin distinguir mayúsculas ni acentos.
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function pasaFiltroMarca(marca: boolean | null, filtro: FiltroMarca): boolean {
  if (filtro === "todas") return true;
  if (filtro === "si") return marca === true;
  if (filtro === "no") return marca === false;
  return marca === null;
}

export function filtrarControl(
  renglones: RenglonControl[],
  { marca, q }: { marca: FiltroMarca; q: string }
): RenglonControl[] {
  const buscado = normalizar(q);
  return renglones.filter(
    (r) =>
      pasaFiltroMarca(r.marca, marca) &&
      (!buscado ||
        normalizar([r.modelo, r.numeroPm, r.ot, r.equipo, r.proceso, r.nota].filter(Boolean).join(" ")).includes(buscado))
  );
}

export function conteosControl(renglones: RenglonControl[]): Record<FiltroMarca, number> {
  return {
    todas: renglones.length,
    no: renglones.filter((r) => r.marca === false).length,
    sin: renglones.filter((r) => r.marca === null).length,
    si: renglones.filter((r) => r.marca === true).length,
  };
}

// --- Historial -----------------------------------------------------------------------------------

export type FiltroCambio = "todos" | "si" | "no" | "quitada";

export const FILTROS_CAMBIO: { valor: FiltroCambio; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "no", etiqueta: "Pasó a no está" },
  { valor: "si", etiqueta: "Pasó a sí está" },
  { valor: "quitada", etiqueta: "Marca quitada" },
];

export function leerFiltroCambio(valor: string | undefined): FiltroCambio {
  return FILTROS_CAMBIO.find((f) => f.valor === valor)?.valor ?? "todos";
}

// Cambios del historial que pasan los filtros: el cambio (marca nueva), el texto y el rango de días
// (hora de México, "AAAA-MM-DD"; vacío = sin límite).
export function filtrarHistorial(
  eventos: EventoMarca[],
  { cambio, q, desde, hasta }: { cambio: FiltroCambio; q: string; desde: string | null; hasta: string | null }
): EventoMarca[] {
  const buscado = normalizar(q);
  return eventos.filter((e) => {
    if (cambio === "si" && e.esta !== true) return false;
    if (cambio === "no" && e.esta !== false) return false;
    if (cambio === "quitada" && e.esta !== null) return false;
    const dia = diaMexico(e.hecho_en);
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    if (!buscado) return true;
    return normalizar(
      [e.modelo, e.numero_pedido, e.orden_trabajo, e.equipo, e.nota, e.hecho_por_nombre].filter(Boolean).join(" ")
    ).includes(buscado);
  });
}
