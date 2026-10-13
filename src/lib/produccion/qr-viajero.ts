// El QR de la Hoja de Viajero codifica la URL absoluta de un ítem. Hay dos formatos:
//  - corto (el de las hojas nuevas): /q/<ítem>, que lleva pocos caracteres y por eso un código
//    menos denso, más fácil de leer con el celular (ver app/q/[itemId]/page.tsx);
//  - largo (el de las hojas ya impresas): /produccion/pedidos/<pedido>/viajero/<ítem>.
// El escáner solo saca de ahí los ids y navega a una ruta propia con ellos: nunca abre la
// URL leída, así un QR ajeno no puede llevar a otro sitio.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RUTA_VIAJERO = new RegExp(`^/produccion/pedidos/(${UUID})/viajero/(${UUID})/?$`, "i");
const RUTA_CORTA = new RegExp(`^/q/(${UUID})/?$`, "i");
const SOLO_UUID = new RegExp(`^${UUID}$`, "i");

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && SOLO_UUID.test(valor);
}

// Lo leído por el escáner -> ids del pedido (null en el formato corto, que solo trae el ítem) e
// ítem, o null si no es un QR de viajero (otra ruta, otro protocolo, texto suelto).
export function itemDeQrViajero(texto: string): { pedidoId: string | null; itemId: string } | null {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const corta = RUTA_CORTA.exec(url.pathname);
  if (corta) return { pedidoId: null, itemId: corta[1].toLowerCase() };
  const m = RUTA_VIAJERO.exec(url.pathname);
  if (!m) return null;
  return { pedidoId: m[1].toLowerCase(), itemId: m[2].toLowerCase() };
}
