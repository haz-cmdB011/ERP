// fetch para los formularios de la interfaz: NUNCA lanza. Devuelve siempre un resultado
// con un mensaje listo para mostrar.
//
// Por qué existe: un `await fetch()` sin try/catch lanza si se cae la red, y el botón se
// quedaba en "Guardando…" para siempre, sin mensaje (reproducido en /registro con la red
// cortada). Además, una respuesta que no es JSON (página de error del proveedor, 502/504)
// hacía lanzar a `res.json()`, y una petición colgada con mala señal nunca terminaba.

/** Mensaje de reserva cuando algo falló y no hay nada más específico que decir. */
export const ERROR_GENERICO = "No se pudo completar la acción.";
export const MENSAJE_SIN_RED = "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
export const MENSAJE_TIEMPO_AGOTADO = "La conexión tardó demasiado. Revisa tu señal e inténtalo de nuevo.";

// Pasado este tiempo sin respuesta se da por perdida la petición (las subidas de fotos
// grandes usan su propio tiempo; ver `esperaMs`).
export const ESPERA_POR_DEFECTO_MS = 60_000;

export interface RespuestaJson<T> {
  /** Respondió 2xx. */
  ok: boolean;
  /** Código HTTP; 0 si no hubo respuesta (sin red o tiempo agotado). */
  status: number;
  /** Cuerpo JSON, o {} si no había o no era JSON. */
  data: T;
  /** Mensaje para mostrar cuando algo falló; null si salió bien. */
  error: string | null;
  /** true = no llegó respuesta (sin red, corte o tiempo agotado). */
  sinRed: boolean;
}

export interface OpcionesFetchJson extends RequestInit {
  /** Tiempo máximo en milisegundos antes de darla por perdida. */
  esperaMs?: number;
}

/** Mensaje por defecto para un fallo HTTP cuando el servidor no mandó uno propio. */
export function mensajeDeEstado(status: number): string {
  if (status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
  if (status === 403) return "No tienes permiso para hacer esto.";
  if (status === 413) return "El archivo es demasiado grande.";
  if (status === 429) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (status >= 500) return "El servidor tuvo un problema. Inténtalo de nuevo en un momento.";
  return ERROR_GENERICO;
}

function textoDeError(data: unknown): string | null {
  if (typeof data === "object" && data !== null && "error" in data) {
    const e = (data as { error: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return null;
}

export async function fetchJson<T extends object = { error?: string }>(
  url: string,
  { esperaMs = ESPERA_POR_DEFECTO_MS, signal, ...init }: OpcionesFetchJson = {}
): Promise<RespuestaJson<T>> {
  const control = new AbortController();
  let agotado = false;
  const temporizador = setTimeout(() => {
    agotado = true;
    control.abort();
  }, esperaMs);
  // Si quien llama también quiere poder cancelar, se respeta.
  const alCancelar = () => control.abort();
  if (signal) {
    if (signal.aborted) control.abort();
    else signal.addEventListener("abort", alCancelar, { once: true });
  }

  try {
    const res = await fetch(url, { ...init, signal: control.signal });
    // El cuerpo también puede cortarse o no ser JSON: no debe tirar la petición.
    const data = (await res.json().catch(() => ({}))) as T;
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : (textoDeError(data) ?? mensajeDeEstado(res.status)),
      sinRed: false,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: {} as T,
      error: agotado ? MENSAJE_TIEMPO_AGOTADO : MENSAJE_SIN_RED,
      sinRed: true,
    };
  } finally {
    clearTimeout(temporizador);
    signal?.removeEventListener("abort", alCancelar);
  }
}
