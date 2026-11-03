// Genera src/app/tema-oscuro.css a partir de la paleta de Tailwind instalada.
// Uso: node scripts/generar-tema-oscuro.mjs
//
// La app está escrita con clases de modo claro (bg-white, text-slate-900...).
// En modo oscuro, en vez de añadir dark: a cada clase, se invierte la escala
// de cada color (50↔950, 100↔900, ..., 400↔600) y blanco↔casi negro: así un
// texto slate-900 sobre fondo white pasa a slate-50 sobre fondo oscuro, y los
// avisos red-50/red-700 pasan a red-950/red-300, conservando el contraste.
import { readFileSync, writeFileSync } from "node:fs";

const tema = readFileSync("node_modules/tailwindcss/theme.css", "utf8");
const colores = new Map();
for (const [, nombre, valor] of tema.matchAll(/--color-([a-z]+-\d+):\s*([^;]+);/g)) {
  colores.set(nombre, valor.trim());
}

// La marca (verde Mobiliarium) no viene en Tailwind: se lee de su escala en
// src/app/globals.css (--color-brand-50...950) para espejarla igual que el resto.
const globales = readFileSync("src/app/globals.css", "utf8");
for (const [, paso, valor] of globales.matchAll(/--color-(brand-\d+):\s*([^;]+);/g)) {
  colores.set(paso, valor.trim());
}

const PASOS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const familias = [...new Set([...colores.keys()].map((n) => n.split("-")[0]))];

// Fondo de "papel" oscuro y su opuesto para el texto que era blanco.
const BLANCO_OSCURO = "oklch(19% 0.03 264)"; // tarjetas y fondos claros
const NEGRO_CLARO = colores.get("slate-100");

const oscuro = [];
const claro = [];
for (const f of familias) {
  PASOS.forEach((paso, i) => {
    const origen = colores.get(`${f}-${paso}`);
    const espejo = colores.get(`${f}-${PASOS[PASOS.length - 1 - i]}`);
    if (!origen || !espejo) return;
    oscuro.push(`    --color-${f}-${paso}: ${espejo};`);
    claro.push(`  --color-${f}-${paso}: ${origen};`);
  });
}

// Estilo "Mobiliarium" (mobiliarium.css): en oscuro, los grises (slate y gray,
// los de superficies, bordes y texto) pierden su tinte azul y toman uno verde
// muy leve, el de la barra superior de la marca.
const TINTE = { hue: 150, croma: 0.35 };
function tenir(valor) {
  const m = /^oklch\(([\d.]+%)\s+([\d.]+)\s+([\d.]+)\)$/.exec(valor);
  if (!m) return valor;
  const croma = Math.round(Number(m[2]) * TINTE.croma * 1000) / 1000;
  return `oklch(${m[1]} ${croma} ${TINTE.hue})`;
}
const grisesMobiliarium = [];
for (const f of ["slate", "gray"]) {
  PASOS.forEach((paso, i) => {
    const espejo = colores.get(`${f}-${PASOS[PASOS.length - 1 - i]}`);
    if (espejo) grisesMobiliarium.push(`    --color-${f}-${paso}: ${tenir(espejo)};`);
  });
}
const variablesMobiliarium = `    --color-white: oklch(19% 0.014 ${TINTE.hue});
${grisesMobiliarium.join("\n")}`;

const variablesOscuras = `    color-scheme: dark;
    --color-white: ${BLANCO_OSCURO};
    --color-black: ${NEGRO_CLARO};
${oscuro.join("\n")}`;

const css = `/* ARCHIVO GENERADO por scripts/generar-tema-oscuro.mjs — no editar a mano. */

/* Modo oscuro. Solo en pantalla: al imprimir se usa siempre la paleta clara.
   <html data-tema="claro|oscuro"> es la elección del usuario en el botón de
   tema (src/components/selector-tema.tsx); sin ese atributo se sigue la
   preferencia del sistema/navegador. */
@media screen and (prefers-color-scheme: dark) {
  :root:not([data-tema="claro"]) {
${variablesOscuras}
  }
}
@media screen {
  :root[data-tema="oscuro"] {
${variablesOscuras}
  }
}

/* Estilo "Mobiliarium" en oscuro: grises con tinte verde carbón. */
@media screen and (prefers-color-scheme: dark) {
  :root[data-estilo="mobiliarium"]:not([data-tema="claro"]) {
${variablesMobiliarium}
  }
}
@media screen {
  :root[data-estilo="mobiliarium"][data-tema="oscuro"] {
${variablesMobiliarium}
  }
}

/* Fichas que se capturan como PDF (html2canvas) o se imprimen: siempre en
   claro, sin importar el modo del usuario. */
[data-informe],
[data-viajero-ficha],
[data-siempre-claro] {
  color-scheme: light;
  color: #171717;
  --color-white: #fff;
  --color-black: #000;
${claro.join("\n")}
}
`;
writeFileSync("src/app/tema-oscuro.css", css);
console.log(`tema-oscuro.css: ${familias.length} familias de color`);
