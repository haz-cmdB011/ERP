// Comprueba si una contraseña aparece en filtraciones de datos conocidas, con el
// servicio Pwned Passwords (Have I Been Pwned) en modo k-anonimato: la
// contraseña NUNCA sale del servidor/navegador; solo se envían los primeros 5
// caracteres de su hash SHA-1 y la comparación del resto se hace aquí.
//
// Sustituye a la opción "Leaked password protection" de Supabase Auth mientras
// no esté activada en el panel (ver CLAUDE.md). Si el servicio no responde, la
// comprobación NO bloquea (falla abierto): no puede impedir crear usuarios.

export const MENSAJE_CONTRASENA_FILTRADA =
  "Esa contraseña aparece en filtraciones de datos conocidas. Elige otra.";

async function sha1Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-1", datos);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

// true solo si se CONFIRMA que la contraseña está filtrada.
export async function contrasenaFiltrada(password: string): Promise<boolean> {
  if (!password) return false;
  try {
    const hash = await sha1Hex(password);
    const prefijo = hash.slice(0, 5);
    const sufijo = hash.slice(5);
    const respuesta = await fetch(`https://api.pwnedpasswords.com/range/${prefijo}`, {
      // Add-Padding: la respuesta trae entradas falsas (conteo 0) para que su
      // tamaño no delate cuántas coincidencias hay.
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
    });
    if (!respuesta.ok) return false;
    const texto = await respuesta.text();
    return texto.split(/\r?\n/).some((linea) => {
      const [s, conteo] = linea.trim().split(":");
      return s?.toUpperCase() === sufijo && Number(conteo) > 0;
    });
  } catch {
    return false;
  }
}
