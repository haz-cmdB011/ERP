// Reglas del registro público (/api/registro): validación estricta de lo que
// llega y topes contra altas masivas. Sin dependencias externas: funciona en
// Vercel (serverless) con dos defensas que se complementan:
//  - tope GLOBAL por hora, contado en la base (vale en todas las instancias);
//  - tope por IP en memoria (best-effort: cada instancia lleva su cuenta).

export const MAX_NOMBRE = 80;
export const MAX_EMAIL = 254;
export const MIN_PASSWORD = 8;
// bcrypt (el hash de Supabase) solo usa los primeros 72 bytes.
export const MAX_PASSWORD = 72;

// Altas permitidas en total por hora, y por IP cada 15 minutos.
export const MAX_ALTAS_POR_HORA = 20;
export const MAX_ALTAS_POR_IP = 5;
export const VENTANA_IP_MS = 15 * 60 * 1000;

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(email: string): boolean {
  return email.length <= MAX_EMAIL && FORMATO_EMAIL.test(email);
}

// "mobiliarium.com, gcdi.com.mx" -> ["mobiliarium.com", "gcdi.com.mx"]. Vacío = sin restricción.
export function dominiosPermitidos(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function dominioPermitido(email: string, permitidos: string[]): boolean {
  if (permitidos.length === 0) return true;
  const dominio = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return permitidos.includes(dominio);
}

// Limitador por IP en memoria. `ahora` y `registro` se inyectan para poder probarlo.
export function crearLimitadorPorIp(
  maximo: number = MAX_ALTAS_POR_IP,
  ventanaMs: number = VENTANA_IP_MS
) {
  const intentos = new Map<string, number[]>();
  return function excede(ip: string, ahora: number = Date.now()): boolean {
    const recientes = (intentos.get(ip) ?? []).filter((t) => ahora - t < ventanaMs);
    if (recientes.length >= maximo) {
      intentos.set(ip, recientes);
      return true;
    }
    recientes.push(ahora);
    intentos.set(ip, recientes);
    // Evita que el mapa crezca sin límite con IPs que no vuelven.
    if (intentos.size > 5000) {
      for (const [clave, tiempos] of intentos) {
        if (tiempos.every((t) => ahora - t >= ventanaMs)) intentos.delete(clave);
      }
    }
    return false;
  };
}

// IP del cliente tal como la informa Vercel (primer valor de x-forwarded-for).
export function ipDe(request: Request): string {
  const reenviada = request.headers.get("x-forwarded-for");
  return (reenviada?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "desconocida").trim();
}
