// Límite de intentos por clave, contado en la base (función consumir_limite), así que
// vale para todas las instancias del servidor. Solo para rutas de servidor.
//
// Si la base no responde (o la migración aún no se aplicó) NO se bloquea a nadie: el
// ERP sigue funcionando y el error queda en el registro del servidor. Es un freno
// contra abusos, no un control de acceso (para eso están el rol y el RLS).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface OpcionesLimite {
  /** Qué se limita y a quién: "registro:ip:1.2.3.4", "upload:<id de usuario>"... */
  clave: string;
  maximo: number;
  ventanaSegundos: number;
}

/** true = el intento cabe dentro del límite; false = ya se pasó. */
export async function consumirLimite({ clave, maximo, ventanaSegundos }: OpcionesLimite): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("consumir_limite", {
      p_clave: clave,
      p_maximo: maximo,
      p_ventana_segundos: ventanaSegundos,
    });
    if (error) {
      console.error("limite-tasa: no se pudo consultar el límite", error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("limite-tasa: no se pudo consultar el límite", e);
    return true;
  }
}

/** Respuesta 429 estándar, con Retry-After cuando se conoce la ventana. */
export function respuestaLimite(mensaje: string, ventanaSegundos?: number) {
  return NextResponse.json(
    { error: mensaje },
    {
      status: 429,
      headers: ventanaSegundos ? { "Retry-After": String(ventanaSegundos) } : undefined,
    }
  );
}
