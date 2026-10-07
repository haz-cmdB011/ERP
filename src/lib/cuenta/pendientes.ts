// Lo que le falta a una cuenta para estar completa: nombre, foto de perfil y
// verificación en dos pasos. Se resume en el inicio del área para que se vea sin
// tener que entrar a "Mi perfil". La verificación en dos pasos es opcional, así
// que la tarjeta se puede ocultar.

export type PendienteCuenta = "nombre" | "foto" | "mfa";

// Cookie con lo que la persona ya ocultó (ej. "foto-mfa").
export const COOKIE_PENDIENTES_OCULTOS = "erp_cuenta_oculta";
export const TODOS_LOS_PENDIENTES: PendienteCuenta[] = ["nombre", "foto", "mfa"];

export interface EstadoCuenta {
  nombre: string | null | undefined;
  tieneFoto: boolean;
  mfaActivo: boolean;
}

export function pendientesDeCuenta(e: EstadoCuenta): PendienteCuenta[] {
  const pendientes: PendienteCuenta[] = [];
  if (!e.nombre?.trim()) pendientes.push("nombre");
  if (!e.tieneFoto) pendientes.push("foto");
  if (!e.mfaActivo) pendientes.push("mfa");
  return pendientes;
}

// Texto de la cookie al ocultar: los pendientes de ese momento.
export function valorOculto(pendientes: PendienteCuenta[]): string {
  return pendientes.join("-");
}

// La tarjeta se queda oculta mientras no aparezca un pendiente nuevo: si la
// persona completa uno, sigue oculta; si quita su foto después, vuelve.
export function estaOculta(pendientes: PendienteCuenta[], valorCookie: string | undefined): boolean {
  if (pendientes.length === 0) return true;
  if (!valorCookie) return false;
  const ocultos = new Set(valorCookie.split("-"));
  return pendientes.every((p) => ocultos.has(p));
}
