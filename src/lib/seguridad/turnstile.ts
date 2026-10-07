// Cloudflare Turnstile: comprobación anti-robots del registro público.
//
// Es opcional. Se activa definiendo en Vercel NEXT_PUBLIC_TURNSTILE_SITE_KEY (la
// clave del sitio, pública) y TURNSTILE_SECRET_KEY (la secreta, solo servidor). Sin
// la clave secreta el registro funciona como antes, solo con sus topes de intentos.

const URL_VERIFICACION = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const ESPERA_MS = 5000;
// Los tokens miden menos de 2048 caracteres; todo lo demás es basura.
const MAX_TOKEN = 2048;

export function turnstileActivo(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

/**
 * true = Cloudflare confirma que el token es válido. Con el captcha activo, un
 * token ausente, inválido o una falla al consultar a Cloudflare cuentan como NO
 * (cerrado): es la barrera contra altas automáticas.
 */
export async function verificarTurnstile(token: unknown, ip?: string): Promise<boolean> {
  const secreta = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secreta) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN) return false;

  const formulario = new URLSearchParams({ secret: secreta, response: token });
  if (ip && ip !== "desconocida") formulario.set("remoteip", ip);

  try {
    const respuesta = await fetch(URL_VERIFICACION, {
      method: "POST",
      body: formulario,
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    if (!respuesta.ok) return false;
    const datos = (await respuesta.json()) as { success?: boolean };
    return datos.success === true;
  } catch (e) {
    console.error("turnstile: no se pudo verificar el token", e);
    return false;
  }
}
