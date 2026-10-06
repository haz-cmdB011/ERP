// Destinos de redirección que vienen de la URL (p. ej. ?next= en /auth/callback).
// Solo se aceptan rutas internas del propio sitio: sin esto, un valor como
// "@sitio-malo.com" o "//sitio-malo.com" pegado a `${origin}${next}` mandaba a la
// persona a otro dominio justo después de iniciar sesión (redirección abierta,
// útil para phishing).
export function rutaInternaSegura(next: string | null | undefined, porDefecto = "/planeacion"): string {
  if (!next) return porDefecto;
  // Debe ser una ruta absoluta del sitio ("/algo"), no "//otro.com", "/\otro.com" ni "algo".
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return porDefecto;
  // Sin caracteres de control ni saltos de línea (inyección de cabeceras).
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return porDefecto;
  try {
    // Con un origen ficticio: si el resultado cambia de origen, no era interna.
    const base = "https://interno.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return porDefecto;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return porDefecto;
  }
}
