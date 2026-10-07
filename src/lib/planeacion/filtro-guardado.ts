// Último filtro (año y cliente) que se usó en la lista de Pedidos de Planeación,
// recordado en una cookie. No se aplica solo —un filtro puesto sin que se vea
// haría pensar que faltan O.T.—: la lista ofrece volver a él con un enlace.
// La búsqueda de texto y el atajo de entrega no se recuerdan: son consultas del
// momento.

export const COOKIE_FILTRO_PEDIDOS = "erp_plan_filtro";

export interface FiltroGuardado {
  anio?: string;
  cliente?: string;
}

const MAX_CLIENTE = 80;

// Texto de la cookie (sin codificar para cookie; el navegador lo codifica).
export function valorFiltroGuardado(filtro: FiltroGuardado): string {
  const qs = new URLSearchParams();
  if (filtro.anio) qs.set("anio", filtro.anio);
  if (filtro.cliente) qs.set("cliente", filtro.cliente);
  return qs.toString();
}

function leer(valor: string): FiltroGuardado | null {
  const qs = new URLSearchParams(valor);
  const anio = qs.get("anio") ?? "";
  const cliente = (qs.get("cliente") ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  const filtro: FiltroGuardado = {};
  if (/^\d{4}$/.test(anio)) filtro.anio = anio;
  if (cliente && cliente.length <= MAX_CLIENTE) filtro.cliente = cliente;
  return filtro.anio || filtro.cliente ? filtro : null;
}

// Cookie -> filtro, o null si no hay nada utilizable. Tolera que el valor llegue
// ya decodificado o todavía con la codificación de cookie.
export function leerFiltroGuardado(valorCookie: string | undefined): FiltroGuardado | null {
  if (!valorCookie) return null;
  const directo = leer(valorCookie);
  if (directo) return directo;
  try {
    return leer(decodeURIComponent(valorCookie));
  } catch {
    return null;
  }
}

export function etiquetaFiltroGuardado(filtro: FiltroGuardado): string {
  return [filtro.anio, filtro.cliente].filter(Boolean).join(" · ");
}

export function mismoFiltro(a: FiltroGuardado, b: FiltroGuardado): boolean {
  return (a.anio ?? "") === (b.anio ?? "") && (a.cliente ?? "") === (b.cliente ?? "");
}
