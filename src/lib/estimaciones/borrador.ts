// Borrador local de un recibo en captura: se guarda en el navegador mientras se
// escribe, para no perder el trabajo si se cierra la pestaña, se cae la
// conexión o vence la sesión. Solo funciones puras; leer y escribir en
// localStorage lo hace el hook `useBorradorRecibo`.

const VERSION = 1;
// Pasado este tiempo un borrador ya no se ofrece (los precios y las OT cambian).
export const VIGENCIA_BORRADOR_MS = 14 * 24 * 60 * 60 * 1000;

export interface Borrador<T> {
  version: number;
  guardadoEn: string;
  datos: T;
}

// Un borrador por tipo de recibo y por persona: en un equipo compartido no se
// mezclan los de quienes inician sesión en él.
export function claveBorrador(tipo: string, usuarioId: string): string {
  return `erp_borrador_recibo:${tipo}:${usuarioId}`;
}

export function serializarBorrador<T>(datos: T, ahora: Date): string {
  const borrador: Borrador<T> = { version: VERSION, guardadoEn: ahora.toISOString(), datos };
  return JSON.stringify(borrador);
}

// null si no hay nada, está dañado, es de otra versión o ya venció.
export function leerBorrador<T>(texto: string | null, ahora: Date): Borrador<T> | null {
  if (!texto) return null;
  try {
    const b = JSON.parse(texto) as Partial<Borrador<T>> | null;
    if (!b || b.version !== VERSION || typeof b.guardadoEn !== "string" || b.datos == null) {
      return null;
    }
    const edad = ahora.getTime() - new Date(b.guardadoEn).getTime();
    if (!Number.isFinite(edad) || edad < 0 || edad > VIGENCIA_BORRADOR_MS) return null;
    return b as Borrador<T>;
  } catch {
    return null;
  }
}

// Los renglones llevan campos que solo existen en pantalla (un contador para
// las llaves de React y si la tarjeta está plegada). No son parte del trabajo:
// quedan fuera para comparar y para guardar.
const CAMPOS_DE_PANTALLA = new Set(["id", "colapsado"]);

export function sinCamposDePantalla<R extends object>(renglones: R[]): Omit<R, "id" | "colapsado">[] {
  return renglones.map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => !CAMPOS_DE_PANTALLA.has(k))) as Omit<
      R,
      "id" | "colapsado"
    >
  );
}

export function haceCuanto(guardadoEn: string, ahora: Date): string {
  const minutos = Math.floor((ahora.getTime() - new Date(guardadoEn).getTime()) / 60000);
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}
