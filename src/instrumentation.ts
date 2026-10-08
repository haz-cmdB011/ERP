import type { Instrumentation } from "next";

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
