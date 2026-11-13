import type { Instrumentation } from "next";

// En algunas redes (firewall o antivirus que inspecciona TLS) el saludo de Node 24 se
// cuelga porque incluye el intercambio de llaves poscuántico (X25519MLKEM768), que hace el
// ClientHello más grande y esos equipos lo descartan: toda llamada del servidor a Supabase
// tarda 10 s y falla con "fetch failed" (el navegador y curl sí funcionan). En desarrollo se
// pide solo X25519/P-256/P-384, que cualquier equipo acepta. Vercel (producción) no se toca.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "development") {
    const { default: tls } = await import("node:tls");
    tls.DEFAULT_ECDH_CURVE = "X25519:prime256v1:secp384r1";
  }
}

// Next llama a esta función cuando una petición del SERVIDOR falla (al pintar una
// pantalla, en una ruta /api o en una acción). Si hay ALERTA_WEBHOOK_URL se avisa por
// ahí (ver src/lib/observabilidad/alertas.ts); sin ella no hace nada. El fallo sigue su
// curso normal: aquí solo se avisa.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { avisarError, digestDe, mensajeDe } = await import("@/lib/observabilidad/alertas");
  await avisarError({
    origen: "servidor",
    mensaje: mensajeDe(error),
    digest: digestDe(error),
    ruta: request.path,
    metodo: request.method,
    tipo: context.routeType,
  });
};
