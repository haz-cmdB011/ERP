// Aviso de fallos: manda un mensaje a un webhook (Slack, Discord, Teams con conector
// entrante, ntfy...) cuando el servidor o el navegador de alguien truena.
//
// Es opcional y no depende de ningún servicio de pago: se activa definiendo
// ALERTA_WEBHOOK_URL (https) en Vercel. Sin ella no hace nada.
//
// Reglas para que no estorbe:
//  - nunca lanza error ni retrasa la respuesta más de ESPERA_MS;
//  - el mismo fallo no se repite durante VENTANA_MS (por instancia del servidor);
//  - no manda cuerpos de petición, cookies ni cabeceras: solo ruta sin parámetros, tipo
//    de fallo, un mensaje recortado y el "digest" de Next para buscarlo en los registros
//    de Vercel; los correos que aparezcan en el mensaje se tapan.

export interface DatosAlerta {
  origen: "servidor" | "navegador";
  mensaje: string;
  digest?: string;
  ruta?: string;
  metodo?: string;
  tipo?: string;
}

export const VENTANA_MS = 10 * 60 * 1000;
export const ESPERA_MS = 3000;
const MAX_MENSAJE = 300;
const MAX_RUTA = 120;
const MAX_CLAVES = 500;

const recientes = new Map<string, number>();

export function recortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

const CORREO = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

export function limpiarMensaje(texto: string): string {
  return recortar(texto.replace(CORREO, "[correo]").replace(/\s+/g, " ").trim(), MAX_MENSAJE);
}

// "/planeacion/pedidos/abc?q=secreto#x" -> "/planeacion/pedidos/abc"
export function limpiarRuta(ruta: string | undefined): string {
  if (!ruta) return "";
  return recortar(ruta.split(/[?#]/)[0], MAX_RUTA);
}

export function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function digestDe(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : undefined;
}

// Los redirects y los "no encontrado" de Next no son fallos.
export function esFalloEsperado(datos: Pick<DatosAlerta, "mensaje" | "digest">): boolean {
  return /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(datos.digest ?? "") ||
    /^NEXT_(REDIRECT|NOT_FOUND)/.test(datos.mensaje);
}

export function claveAlerta(datos: DatosAlerta): string {
  return [datos.origen, datos.digest || limpiarRuta(datos.ruta), limpiarMensaje(datos.mensaje).slice(0, 80)].join("|");
}

// true = se debe avisar (no se avisó de lo mismo hace poco). Registra el aviso.
export function debeAvisar(clave: string, ahora: number = Date.now()): boolean {
  const ultimo = recientes.get(clave);
  if (ultimo !== undefined && ahora - ultimo < VENTANA_MS) return false;
  if (recientes.size >= MAX_CLAVES) {
    for (const [k, t] of recientes) if (ahora - t >= VENTANA_MS) recientes.delete(k);
    if (recientes.size >= MAX_CLAVES) recientes.clear();
  }
  recientes.set(clave, ahora);
  return true;
}

export function reiniciarAlertas() {
  recientes.clear();
}

export function textoAlerta(datos: DatosAlerta, entorno: string): string {
  const donde = [datos.metodo, limpiarRuta(datos.ruta)].filter(Boolean).join(" ");
  return [
    `⚠️ ERP (${entorno}) · fallo en el ${datos.origen}${datos.tipo ? ` (${datos.tipo})` : ""}`,
    donde && `Dónde: ${donde}`,
    `Qué: ${limpiarMensaje(datos.mensaje)}`,
    datos.digest && `Digest: ${datos.digest} (búscalo en los registros de Vercel)`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface OpcionesAviso {
  webhook?: string;
  entorno?: string;
  enviar?: typeof fetch;
}

/** true = se mandó el aviso. Nunca lanza. */
export async function avisarError(datos: DatosAlerta, opciones: OpcionesAviso = {}): Promise<boolean> {
  try {
    const webhook = (opciones.webhook ?? process.env.ALERTA_WEBHOOK_URL ?? "").trim();
    if (!webhook.startsWith("https://")) return false;
    if (process.env.NODE_ENV === "development") return false;
    if (esFalloEsperado(datos)) return false;
    if (!debeAvisar(claveAlerta(datos))) return false;

    const entorno = opciones.entorno ?? process.env.VERCEL_ENV ?? "local";
    const texto = textoAlerta(datos, entorno);
    const respuesta = await (opciones.enviar ?? fetch)(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // "text": Slack y compatibles; "content": Discord.
      body: JSON.stringify({ text: texto, content: texto }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    return respuesta.ok;
  } catch {
    return false;
  }
}
