// Lo que lleva una notificación: título, texto y a dónde lleva al tocarla. Se arma aquí (y no en cada lugar que
// avisa) para que siempre salga corto, sin datos de más y con un enlace que solo apunta dentro del ERP.

import { rutaInternaSegura } from "@/lib/seguridad/redireccion";

export const MAX_TITULO = 80;
export const MAX_CUERPO = 200;

export interface Notificacion {
  titulo: string;
  cuerpo: string;
  // Pantalla del ERP que abre al tocarla ("/produccion/panel?ids=…"); por omisión, el inicio.
  url?: string;
  // Dos avisos con la misma etiqueta se reemplazan entre sí en el celular (en vez de apilarse).
  etiqueta?: string;
}

// El texto que viaja al celular (JSON). Los textos se recortan y la dirección se limpia.
export function armarCarga(n: Notificacion): string {
  return JSON.stringify({
    titulo: n.titulo.trim().slice(0, MAX_TITULO) || "ERP Mobiliarium",
    cuerpo: n.cuerpo.trim().slice(0, MAX_CUERPO),
    url: rutaInternaSegura(n.url, "/"),
    etiqueta: n.etiqueta?.slice(0, 64),
  });
}
