// Instalar la app del ERP en el celular (pantalla /instalar y su hoja con QR). Lógica sin navegador, para
// poder probarla; la pantalla vive en src/app/instalar/.

export type Plataforma = "ios" | "android" | "escritorio" | "otra";

// Qué aparato es, por su user agent. iPadOS se anuncia como Mac: se distingue por la pantalla táctil.
export function plataformaDe(userAgent: string, puntosTactiles = 0): Plataforma {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && puntosTactiles > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  if (/Windows|Macintosh|X11|Linux|CrOS/i.test(userAgent)) return "escritorio";
  return "otra";
}

// Solo los navegadores de Chrome (Chrome, Edge, Samsung Internet…) avisan cuándo se puede instalar y dejan
// pedir la instalación con un botón. En iPhone y iPad se hace a mano desde "Compartir".
export function instalaConBoton(plataforma: Plataforma): boolean {
  return plataforma === "android" || plataforma === "escritorio";
}

// Lo que el botón de instalar le dice a quien lo toca, según cómo va.
export type EstadoInstalacion = "preparando" | "listo" | "instalando" | "instalada" | "rechazada";

export function textoBoton(estado: EstadoInstalacion): string {
  switch (estado) {
    case "preparando":
      return "Preparando…";
    case "instalando":
      return "Instalando…";
    case "instalada":
      return "Instalada";
    case "rechazada":
    case "listo":
      return "Instalar app";
  }
}

// Segundos que se espera el aviso del navegador antes de mostrar la ayuda manual.
export const ESPERA_AVISO_MS = 2500;
// Tiempo que se deja ver "¡Listo!" (y el aviso de registrarse primero) antes de pasar al inicio de sesión. Se puede
// tocar "Registrarme" o "Ya tengo cuenta" sin esperar.
export const PAUSA_AL_INSTALAR_MS = 3500;
