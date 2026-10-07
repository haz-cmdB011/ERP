// El QR de la Hoja de Viajero codifica la URL absoluta del viajero del ítem
// (/produccion/pedidos/<pedido>/viajero/<ítem>, ver viajero/[itemId]/page.tsx).
// El escáner solo saca de ahí los dos ids y navega a una ruta propia con ellos:
// nunca abre la URL leída, así un QR ajeno no puede llevar a otro sitio.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RUTA_VIAJERO = new RegExp(`^/produccion/pedidos/(${UUID})/viajero/(${UUID})/?$`, "i");
const SOLO_UUID = new RegExp(`^${UUID}$`, "i");

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && SOLO_UUID.test(valor);
}

// Lo leído por el escáner -> ids del pedido e ítem, o null si no es un QR de
// viajero (otra ruta, otro protocolo, texto suelto).
export function itemDeQrViajero(texto: string): { pedidoId: string; itemId: string } | null {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const m = RUTA_VIAJERO.exec(url.pathname);
  if (!m) return null;
  return { pedidoId: m[1].toLowerCase(), itemId: m[2].toLowerCase() };
}
