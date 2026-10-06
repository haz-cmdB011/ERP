// Verificación en dos pasos (TOTP: Google Authenticator, Microsoft Authenticator,
// Authy...). Es opcional para cada persona; quien la activa necesita, además de su
// contraseña, el código de 6 dígitos de su app.
//
// Supabase marca la sesión con un nivel de aseguramiento (AAL):
//   aal1 = entró solo con contraseña · aal2 = también pasó el código.
// Si la persona tiene el segundo paso activado (nextLevel "aal2") pero su sesión
// sigue en aal1, todavía no terminó de iniciar sesión.

export interface NivelAseguramiento {
  currentLevel: string | null;
  nextLevel: string | null;
}

// ¿Falta el segundo paso? Solo se bloquea cuando es explícito: ante cualquier duda
// (sin dato, sin segundo paso activado) NO se bloquea, para no dejar a nadie fuera
// por un error de lectura.
export function faltaSegundoPaso(nivel: NivelAseguramiento | null | undefined): boolean {
  return !!nivel && nivel.nextLevel === "aal2" && nivel.currentLevel !== "aal2";
}

// Rutas que se pueden usar antes de completar el segundo paso (para poder terminar
// de iniciar sesión, registrarse o recuperar la contraseña).
const RUTAS_LIBRES = ["/login", "/registro", "/auth", "/api/registro", "/manifest.webmanifest"];

export function exigeSegundoPaso(pathname: string): boolean {
  return !RUTAS_LIBRES.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`));
}

// Los códigos TOTP son de 6 dígitos; se limpian espacios que mete el teclado.
export function normalizarCodigo(valor: string): string {
  return valor.replace(/\s+/g, "");
}

export function codigoValido(valor: string): boolean {
  return /^\d{6}$/.test(normalizarCodigo(valor));
}
