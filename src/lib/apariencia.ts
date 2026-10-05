// Apariencia personalizable (vidrio esmerilado / glassmorphism): color de
// acento, tres colores para la hoja de planos de muebles del fondo, y
// transparencia y desenfoque de los paneles que la difuminan. Vive en este navegador (localStorage) y se aplica como
// variables CSS en <html style="--marca: ...">, que es lo que leen
// src/app/vidrio.css y la escala --color-brand-* de globals.css.
export interface Apariencia {
  marca: string;
  fondo1: string;
  fondo2: string;
  fondo3: string;
  // Opacidad de los paneles, en % (más bajo = más transparente).
  opacidad: number;
  // Desenfoque de lo que queda detrás de los paneles, en px.
  desenfoque: number;
}

export const CLAVE_APARIENCIA = "erp-apariencia";

export const LIMITES = {
  opacidad: { min: 30, max: 95 },
  desenfoque: { min: 0, max: 40 },
} as const;

export interface Preset {
  id: string;
  nombre: string;
  valores: Apariencia;
}

// fondo1 tiñe el papel de la hoja de planos del fondo, fondo2 son los trazos
// de los muebles y fondo3 las cotas (ver src/components/fondo-mobiliario.tsx).
export const PRESETS: Preset[] = [
  {
    id: "mobiliarium",
    nombre: "Mobiliarium",
    valores: { marca: "#7cfc00", fondo1: "#7cfc00", fondo2: "#3f6212", fondo3: "#0f766e", opacidad: 58, desenfoque: 14 },
  },
  {
    id: "plano-azul",
    nombre: "Plano azul",
    valores: { marca: "#38bdf8", fondo1: "#0ea5e9", fondo2: "#1e3a8a", fondo3: "#0369a1", opacidad: 58, desenfoque: 14 },
  },
  {
    id: "nogal",
    nombre: "Nogal",
    valores: { marca: "#f59e0b", fondo1: "#d97706", fondo2: "#78350f", fondo3: "#9a3412", opacidad: 58, desenfoque: 14 },
  },
  {
    id: "terracota",
    nombre: "Terracota",
    valores: { marca: "#fb7185", fondo1: "#f97316", fondo2: "#7c2d12", fondo3: "#be123c", opacidad: 58, desenfoque: 14 },
  },
  {
    id: "lavanda",
    nombre: "Lavanda",
    valores: { marca: "#a78bfa", fondo1: "#8b5cf6", fondo2: "#4c1d95", fondo3: "#be185d", opacidad: 58, desenfoque: 14 },
  },
  {
    id: "grafito",
    nombre: "Grafito",
    valores: { marca: "#e2e8f0", fondo1: "#64748b", fondo2: "#1e293b", fondo3: "#475569", opacidad: 62, desenfoque: 12 },
  },
];

export const APARIENCIA_INICIAL: Apariencia = PRESETS[0].valores;

const HEX = /^#[0-9a-f]{6}$/;

function color(valor: unknown, porDefecto: string): string {
  if (typeof valor !== "string") return porDefecto;
  const v = valor.trim().toLowerCase();
  return HEX.test(v) ? v : porDefecto;
}

function numero(valor: unknown, porDefecto: number, { min, max }: { min: number; max: number }): number {
  const n = typeof valor === "number" ? valor : Number.NaN;
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// Lo guardado puede venir de otra versión o estar alterado: se valida campo
// por campo y lo que no sirve vuelve al valor inicial.
export function normalizarApariencia(valor: unknown): Apariencia {
  const v = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>;
  const d = APARIENCIA_INICIAL;
  return {
    marca: color(v.marca, d.marca),
    fondo1: color(v.fondo1, d.fondo1),
    fondo2: color(v.fondo2, d.fondo2),
    fondo3: color(v.fondo3, d.fondo3),
    opacidad: numero(v.opacidad, d.opacidad, LIMITES.opacidad),
    desenfoque: numero(v.desenfoque, d.desenfoque, LIMITES.desenfoque),
  };
}

// Luminancia relativa WCAG de un color #rrggbb.
export function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

// Texto sobre el acento (botones verdes, pestaña activa): oscuro o blanco,
// el que dé más contraste.
export function textoSobreMarca(hex: string): "oscuro" | "claro" {
  const l = luminancia(hex);
  const contrasteNegro = (l + 0.05) / 0.05;
  const contrasteBlanco = 1.05 / (l + 0.05);
  return contrasteNegro >= contrasteBlanco ? "oscuro" : "claro";
}

export function variablesApariencia(a: Apariencia): Record<string, string> {
  return {
    "--marca": a.marca,
    "--sobre-marca": textoSobreMarca(a.marca) === "oscuro" ? "#0b1300" : "#ffffff",
    "--fondo-1": a.fondo1,
    "--fondo-2": a.fondo2,
    "--fondo-3": a.fondo3,
    "--vidrio-opacidad": `${a.opacidad}%`,
    "--vidrio-desenfoque": `${a.desenfoque}px`,
  };
}

export function aplicarApariencia(a: Apariencia, raiz: HTMLElement = document.documentElement) {
  for (const [nombre, valor] of Object.entries(variablesApariencia(a))) {
    raiz.style.setProperty(nombre, valor);
  }
}

// Corre en <head> antes de pintar (ver src/app/layout.tsx), igual que
// SCRIPT_TEMA. Repite en pequeño la validación y el cálculo de contraste de
// arriba: no puede importar módulos.
export const SCRIPT_APARIENCIA = `(function(){try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(
  CLAVE_APARIENCIA
)})||"null");if(!a||typeof a!=="object")return;var r=document.documentElement.style,h=/^#[0-9a-f]{6}$/;function c(k,n){if(typeof a[k]==="string"&&h.test(a[k]))r.setProperty(n,a[k])}function x(k,n,u,lo,hi){var v=a[k];if(typeof v==="number"&&isFinite(v))r.setProperty(n,Math.min(hi,Math.max(lo,Math.round(v)))+u)}c("marca","--marca");c("fondo1","--fondo-1");c("fondo2","--fondo-2");c("fondo3","--fondo-3");x("opacidad","--vidrio-opacidad","%",${LIMITES.opacidad.min},${LIMITES.opacidad.max});x("desenfoque","--vidrio-desenfoque","px",${LIMITES.desenfoque.min},${LIMITES.desenfoque.max});if(typeof a.marca==="string"&&h.test(a.marca)){var L=0;[1,3,5].forEach(function(i,j){var v=parseInt(a.marca.slice(i,i+2),16)/255;v=v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);L+=[0.2126,0.7152,0.0722][j]*v});r.setProperty("--sobre-marca",(L+0.05)/0.05>=1.05/(L+0.05)?"#0b1300":"#ffffff")}}catch(e){}})()`;
