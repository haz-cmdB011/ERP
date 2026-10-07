// Filtros, orden y páginas del Registro de recibos. Todo puro: la pantalla lee
// la URL, aquí se decide qué recibos se ven.

import type { EstadoRecibo } from "./recibos-db";
import { compararFolios } from "./recibos-db";
import { ESTADOS_FILTRO, type ReciboListado } from "./listado-recibos";
import { esTipoCualquierRecibo, type TipoCualquierRecibo } from "./revision-db";

export const RECIBOS_POR_PAGINA = 50;
export const COOKIE_FILTRO_REGISTRO = "erp_reg_filtro";

export interface FiltrosRegistro {
  estado: EstadoRecibo | null;
  q: string;
  tipo: TipoCualquierRecibo | null;
  contratista: string;
  pagina: number;
}

export type ParametrosRegistro = Partial<Record<"estado" | "q" | "tipo" | "contratista" | "pagina", string>>;

const MAX_TEXTO = 80;

export function leerFiltros(p: ParametrosRegistro): FiltrosRegistro {
  const estado = (ESTADOS_FILTRO as readonly string[]).includes(p.estado ?? "")
    ? (p.estado as EstadoRecibo)
    : null;
  const pagina = Number.parseInt(p.pagina ?? "", 10);
  return {
    estado,
    q: (p.q ?? "").trim().slice(0, MAX_TEXTO),
    tipo: p.tipo && esTipoCualquierRecibo(p.tipo) ? p.tipo : null,
    contratista: (p.contratista ?? "").trim().slice(0, MAX_TEXTO),
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  };
}

// Sin mayúsculas ni acentos: "ELECTRIFICACIÓN" encuentra "electrificacion".
function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function contratistasDe(recibos: Pick<ReciboListado, "contratista">[]): string[] {
  return [...new Set(recibos.map((r) => r.contratista.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
}

// Sin estado se ven los vigentes (todo menos cancelados); con estado, solo ese.
export function filtrarRecibos(recibos: ReciboListado[], f: FiltrosRegistro): ReciboListado[] {
  const q = plano(f.q);
  const contratista = plano(f.contratista);
  return recibos.filter((r) => {
    if (f.estado ? r.estado !== f.estado : r.estado === "cancelado") return false;
    if (f.tipo && r.tipo !== f.tipo) return false;
    if (contratista && plano(r.contratista) !== contratista) return false;
    if (q && !plano([r.folio, r.contratista, r.ot, r.obra].join(" ")).includes(q)) return false;
    return true;
  });
}

const PESO_PRIORIDAD: Record<string, number> = { urgente: 0, preferente: 1, normal: 2 };

// Bandeja "Por revisar": primero lo urgente y, dentro de cada prioridad, lo que
// lleva más tiempo esperando.
export function ordenarParaRevision(recibos: ReciboListado[]): ReciboListado[] {
  return [...recibos].sort(
    (a, b) =>
      (PESO_PRIORIDAD[a.prioridad] ?? 3) - (PESO_PRIORIDAD[b.prioridad] ?? 3) ||
      a.guardadoEn.localeCompare(b.guardadoEn) ||
      compararFolios(a.folio, b.folio)
  );
}

export function paginar<T>(
  items: T[],
  pagina: number,
  tamano = RECIBOS_POR_PAGINA
): { items: T[]; pagina: number; totalPaginas: number; total: number } {
  const totalPaginas = Math.max(1, Math.ceil(items.length / tamano));
  const actual = Math.min(Math.max(1, pagina), totalPaginas);
  return {
    items: items.slice((actual - 1) * tamano, actual * tamano),
    pagina: actual,
    totalPaginas,
    total: items.length,
  };
}

// Enlace al Registro con estos filtros (omite lo vacío y la página 1).
export function hrefRegistro(f: Partial<FiltrosRegistro>, base = "/estimaciones/registro"): string {
  const qs = new URLSearchParams();
  if (f.estado) qs.set("estado", f.estado);
  if (f.q) qs.set("q", f.q);
  if (f.tipo) qs.set("tipo", f.tipo);
  if (f.contratista) qs.set("contratista", f.contratista);
  if (f.pagina && f.pagina > 1) qs.set("pagina", String(f.pagina));
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

// --- Último filtro recordado (cookie) ----------------------------------------
// Solo tipo y contratista: son los que se repiten día con día. La búsqueda y el
// estado son consultas del momento. No se aplica solo (un filtro oculto haría
// pensar que faltan recibos): la pantalla ofrece volver a él.

export interface FiltroRegistroGuardado {
  tipo?: TipoCualquierRecibo;
  contratista?: string;
}

export function valorFiltroRegistro(f: FiltroRegistroGuardado): string {
  const qs = new URLSearchParams();
  if (f.tipo) qs.set("tipo", f.tipo);
  if (f.contratista) qs.set("contratista", f.contratista);
  return qs.toString();
}

function leerGuardado(valor: string): FiltroRegistroGuardado | null {
  const qs = new URLSearchParams(valor);
  const tipo = qs.get("tipo") ?? "";
  const contratista = (qs.get("contratista") ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXTO);
  const f: FiltroRegistroGuardado = {};
  if (esTipoCualquierRecibo(tipo)) f.tipo = tipo;
  if (contratista) f.contratista = contratista;
  return f.tipo || f.contratista ? f : null;
}

export function leerFiltroRegistroGuardado(valorCookie: string | undefined): FiltroRegistroGuardado | null {
  if (!valorCookie) return null;
  const directo = leerGuardado(valorCookie);
  if (directo) return directo;
  try {
    return leerGuardado(decodeURIComponent(valorCookie));
  } catch {
    return null;
  }
}

export function etiquetaFiltroRegistro(f: FiltroRegistroGuardado): string {
  return [f.tipo, f.contratista].filter(Boolean).join(" · ");
}
