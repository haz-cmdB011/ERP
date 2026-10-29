// Panel de asignación de Producción: los muebles liberados de todos los PM y O.T.,
// con en qué va cada uno (por asignar, en proceso, terminado). Lógica sin base de datos
// ni navegador, para poder probarla; la lectura vive en panel-db.ts.

import type { EstadoMueble, MuebleFlujo } from "./flujo-mueble";

// Tope de ids en la dirección del panel (37 caracteres cada uno).
export const MAX_IDS_PANEL = 100;

// "activos" = por asignar + en proceso (lo que sigue en el taller o espera equipo).
export type FiltroPanel = "activos" | EstadoMueble | "todos";

export const FILTROS_PANEL: { valor: FiltroPanel; etiqueta: string }[] = [
  { valor: "activos", etiqueta: "Activos" },
  { valor: "por_asignar", etiqueta: "Por asignar" },
  { valor: "en_proceso", etiqueta: "En proceso" },
  { valor: "terminado", etiqueta: "Terminados" },
  { valor: "todos", etiqueta: "Todos" },
];

// Un mueble liberado con el PM y la O.T. a que pertenece.
export interface MuebleDePanel {
  flujo: MuebleFlujo;
  estado: EstadoMueble;
  descripcion: string | null;
  // Cuándo se liberó a producción (ISO); los viejos pueden no tenerlo.
  liberadoEn?: string | null;
  pedidoId: string;
  numeroPm: string;
  ot: string | null;
  proyecto: string | null;
  cliente: string | null;
}

export interface GrupoPmPanel {
  pedidoId: string;
  numeroPm: string;
  proyecto: string | null;
  muebles: MuebleDePanel[];
}

export interface GrupoOtPanel {
  ot: string | null;
  cliente: string | null; // el de su primer PM, como en Pedidos
  pms: GrupoPmPanel[];
  total: number;
}

// Sin filtro en la dirección: al llegar de liberar (muebles elegidos) se ve todo lo elegido; si
// no, lo que sigue activo (los terminados se piden aparte para no cargar el historial).
export function leerFiltroPanel(valor: string | undefined, enfoque: boolean): FiltroPanel {
  const valido = FILTROS_PANEL.find((f) => f.valor === valor);
  if (valido) return valido.valor;
  return enfoque ? "todos" : "activos";
}

export function pasaFiltro(estado: EstadoMueble, filtro: FiltroPanel): boolean {
  if (filtro === "todos") return true;
  if (filtro === "activos") return estado !== "terminado";
  return estado === filtro;
}

export function conteosPanel(muebles: MuebleDePanel[]): Record<FiltroPanel, number> {
  const cuenta = (filtro: FiltroPanel) => muebles.filter((m) => pasaFiltro(m.estado, filtro)).length;
  return Object.fromEntries(FILTROS_PANEL.map((f) => [f.valor, cuenta(f.valor)])) as Record<
    FiltroPanel,
    number
  >;
}

// Búsqueda sin distinguir mayúsculas ni acentos ("pergola" encuentra "PÉRGOLA").
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function coincideBusqueda(m: MuebleDePanel, q: string): boolean {
  const buscado = normalizar(q);
  if (!buscado) return true;
  return normalizar(
    [m.numeroPm, m.ot, m.proyecto, m.cliente, m.flujo.modelo, m.descripcion, m.flujo.item_code]
      .filter((v) => v !== null && v !== undefined)
      .join(" ")
  ).includes(buscado);
}

export function filtrarPanel(
  muebles: MuebleDePanel[],
  { filtro, ot, q }: { filtro: FiltroPanel; ot: string | null; q: string }
): MuebleDePanel[] {
  return muebles.filter(
    (m) => pasaFiltro(m.estado, filtro) && (!ot || m.ot === ot) && coincideBusqueda(m, q)
  );
}

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

// Las O.T. que hay entre los muebles, en orden.
export function otsDePanel(muebles: MuebleDePanel[]): string[] {
  return [...new Set(muebles.flatMap((m) => (m.ot ? [m.ot] : [])))].sort(natural);
}

// O.T. -> PM -> muebles. Las O.T. y los PM van en orden natural (PM9 antes que PM10), los
// muebles por su número de ítem y lo que no tiene O.T. al final.
export function agruparPanel(muebles: MuebleDePanel[]): GrupoOtPanel[] {
  const porOt = new Map<string, Map<string, GrupoPmPanel>>();
  for (const m of muebles) {
    const pms = porOt.get(m.ot ?? "") ?? new Map<string, GrupoPmPanel>();
    const pm = pms.get(m.pedidoId) ?? {
      pedidoId: m.pedidoId,
      numeroPm: m.numeroPm,
      proyecto: m.proyecto,
      muebles: [],
    };
    pm.muebles.push(m);
    pms.set(m.pedidoId, pm);
    porOt.set(m.ot ?? "", pms);
  }
  return [...porOt.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : natural(a, b)))
    .map(([ot, pms]) => {
      const lista = [...pms.values()]
        .sort((a, b) => natural(a.numeroPm, b.numeroPm))
        .map((pm) => ({
          ...pm,
          muebles: [...pm.muebles].sort((a, b) => a.flujo.item_code - b.flujo.item_code),
        }));
      return {
        ot: ot === "" ? null : ot,
        cliente: lista[0]?.muebles[0]?.cliente ?? null,
        pms: lista,
        total: lista.reduce((n, pm) => n + pm.muebles.length, 0),
      };
    });
}

// Cuántos muebles hay en cada estado (para el encabezado de un PM o de una O.T.).
export function contarEstados(muebles: MuebleDePanel[]): Record<EstadoMueble, number> {
  const resumen: Record<EstadoMueble, number> = { por_asignar: 0, en_proceso: 0, terminado: 0 };
  for (const m of muebles) resumen[m.estado] += 1;
  return resumen;
}

export const resumenPm = (pm: GrupoPmPanel) => contarEstados(pm.muebles);

export const resumenOt = (g: GrupoOtPanel) => contarEstados(g.pms.flatMap((pm) => pm.muebles));
