import { NextResponse } from "next/server";
import { avisarError, limpiarMensaje, limpiarRuta } from "@/lib/observabilidad/alertas";
import { ipDe } from "@/lib/seguridad/registro";
import { consumirLimite, respuestaLimite } from "@/lib/seguridad/limite-tasa";

// Fallos que ocurren en el NAVEGADOR de alguien (error.tsx): el servidor no se entera
// solo, así que la pantalla de error avisa aquí y se reenvían al webhook de alertas.
// Es público a propósito (también falla el login), por eso: tope por IP, cuerpo chico
// y solo se aceptan textos cortos.
const MAX_CUERPO = 4096;

export async function POST(request: Request) {
  const largo = Number(request.headers.get("content-length") ?? 0);
  if (largo > MAX_CUERPO) return NextResponse.json({ ok: false }, { status: 413 });

  if (!(await consumirLimite({ clave: `errores:${ipDe(request)}`, maximo: 10, ventanaSegundos: 600 }))) {
    return respuestaLimite("Demasiados avisos.", 600);
  }

  const texto = await request.text().catch(() => "");
  if (texto.length > MAX_CUERPO) return NextResponse.json({ ok: false }, { status: 413 });
  let cuerpo: unknown = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const mensaje = typeof datos.mensaje === "string" ? datos.mensaje : "";
  if (!mensaje) return NextResponse.json({ ok: false }, { status: 400 });

  await avisarError({
    origen: "navegador",
    mensaje: limpiarMensaje(mensaje),
    ruta: limpiarRuta(typeof datos.ruta === "string" ? datos.ruta : undefined),
    tipo: "pantalla",
  });
  return NextResponse.json({ ok: true });
}
