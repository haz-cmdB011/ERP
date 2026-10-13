// Pantallas que exigen sesión. Si alguien las abre sin sesión (p. ej. al escanear el QR de una
// hoja con el celular) se le manda a /login con ?next=<la pantalla>, para volver a ella al entrar
// en lugar de caer siempre en Planeación. Las rutas /api no entran: responden 401 por su cuenta.
const PREFIJOS_PROTEGIDOS = ["/admin", "/calidad", "/estimaciones", "/planeacion", "/produccion", "/q"];

export function esRutaProtegida(pathname: string): boolean {
  return PREFIJOS_PROTEGIDOS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// /login?next=<ruta y parámetros>
export function destinoDeLogin(pathname: string, search: string): string {
  return `/login?next=${encodeURIComponent(`${pathname}${search}`)}`;
}
