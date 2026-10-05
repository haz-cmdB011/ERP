// Reglas del nombre de perfil (módulo puro: también lo usa el formulario de cliente).

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 80;

// Nombre a mostrar: espacios de más fuera; null si queda vacío o fuera de rango.
export function normalizarNombre(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/\s+/g, " ").trim();
  if (limpio.length < NOMBRE_MIN || limpio.length > NOMBRE_MAX) return null;
  return limpio;
}
