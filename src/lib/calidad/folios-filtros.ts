// Filtros de la lista de Folios de calidad (y de su Excel). Puro: la pantalla
// lee la URL y aquí se decide qué se pide a la base.

import { esCategoriaDefecto, type CategoriaDefecto } from "./categorias";

export const ESTADOS_FOLIOS = [
  ["todos", "Todos"],
  ["aprobados", "Aprobados"],
  ["no_aprobados", "No aprobados"],
  ["cancelados", "Cancelados / eliminados"],
] as const;

export type EstadoFolios = (typeof ESTADOS_FOLIOS)[number][0];

export interface FiltrosFolios {
  q: string;
  estado: EstadoFolios;
  // Días "AAAA-MM-DD" de la empresa (ambos incluidos).
  desde: string | null;
  hasta: string | null;
  categoria: CategoriaDefecto | null;
  pagina: number;
}

export type ParametrosFolios = Partial<Record<"q" | "estado" | "desde" | "hasta" | "categoria" | "pagina", string>>;

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaValido(valor: string | undefined): string | null {
  if (!valor || !DIA.test(valor)) return null;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor ? null : valor;
}

export function leerFiltrosFolios(p: ParametrosFolios): FiltrosFolios {
  const pagina = Number.parseInt(p.pagina ?? "", 10);
  let desde = diaValido(p.desde);
  let hasta = diaValido(p.hasta);
  // Un rango al revés se acomoda en vez de devolver siempre cero resultados.
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  return {
    q: (p.q ?? "").trim().slice(0, 40),
    estado: ESTADOS_FOLIOS.some(([v]) => v === p.estado) ? (p.estado as EstadoFolios) : "todos",
    desde,
    hasta,
    categoria: esCategoriaDefecto(p.categoria) ? p.categoria : null,
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  };
}

// México no usa horario de verano desde 2022: la empresa vive en UTC-6 todo el año.
const DESFASE = "-06:00";

// Instantes que acotan los días elegidos (inicio incluido, fin excluido).
export function rangoDeInstantes(f: Pick<FiltrosFolios, "desde" | "hasta">): { inicio: string | null; fin: string | null } {
  const inicio = f.desde ? new Date(`${f.desde}T00:00:00${DESFASE}`).toISOString() : null;
  let fin: string | null = null;
  if (f.hasta) {
    const d = new Date(`${f.hasta}T00:00:00${DESFASE}`);
    d.setUTCDate(d.getUTCDate() + 1);
    fin = d.toISOString();
  }
  return { inicio, fin };
}

export function hrefFolios(f: Partial<FiltrosFolios>, base = "/calidad/folios"): string {
  const qs = new URLSearchParams();
  if (f.q) qs.set("q", f.q);
  if (f.estado && f.estado !== "todos") qs.set("estado", f.estado);
  if (f.desde) qs.set("desde", f.desde);
  if (f.hasta) qs.set("hasta", f.hasta);
  if (f.categoria) qs.set("categoria", f.categoria);
  if (f.pagina && f.pagina > 1) qs.set("pagina", String(f.pagina));
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
