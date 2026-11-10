// Qué hacer cuando alguien toca con el dedo un botón deshabilitado. Con ratón, el motivo sale al
// señalarlo (title); con el dedo no hay "señalar", el navegador no manda el clic y parecía que la pantalla
// no respondía. Lo usa src/components/toque-deshabilitado.tsx.
//
// - "validar": es el botón de enviar de un formulario al que le falta un campo obligatorio; el navegador
//   marca ese campo, lo enfoca y dice qué falta.
// - { aviso }: el botón explica por qué está apagado (title, aria-description o data-motivo); se muestra.
// - null: no hay nada que decir (p. ej. se está guardando).
export type RespuestaToque = "validar" | { aviso: string } | null;

export function respuestaToqueDeshabilitado({
  esEnvio,
  formularioValido,
  motivo,
}: {
  // Es el botón que envía un formulario (type="submit" dentro de un <form>).
  esEnvio: boolean;
  // El formulario pasa sus reglas del navegador (required, min, max...). null si no hay formulario.
  formularioValido: boolean | null;
  // Lo que el botón dice de sí mismo para explicar por qué está apagado.
  motivo: string | null | undefined;
}): RespuestaToque {
  if (esEnvio && formularioValido === false) return "validar";
  const texto = motivo?.trim();
  if (texto) return { aviso: texto };
  return null;
}
