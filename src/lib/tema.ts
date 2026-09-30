// Tema claro/oscuro elegido por el usuario. Sin elección se sigue el del
// sistema; la elección vive en este navegador (localStorage) y se refleja en
// <html data-tema="claro|oscuro">, que es lo que leen tema-oscuro.css y
// globals.css.
export type Tema = "sistema" | "claro" | "oscuro";

export const CLAVE_TEMA = "erp-tema";

export function esTemaElegido(valor: unknown): valor is "claro" | "oscuro" {
  return valor === "claro" || valor === "oscuro";
}

// Corre en <head> antes de pintar (ver src/app/layout.tsx). try/catch: el
// navegador puede bloquear localStorage.
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  CLAVE_TEMA
)});if(t==="claro"||t==="oscuro")document.documentElement.setAttribute("data-tema",t)}catch(e){}})()`;
