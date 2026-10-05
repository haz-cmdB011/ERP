// Vectoriza el logotipo de la interfaz a partir de public/branding/mobiliarium-logo.png
// (300 px de ancho: al agrandarlo se ve borroso). Genera dos SVG que se ven
// nítidos a cualquier tamaño:
//  - mobiliarium-logo-ui.svg: colores originales (para fondo claro).
//  - mobiliarium-logo-ui-claro.svg: texto aclarado para la barra oscura; la
//    estrella conserva su verde.
// El PNG original no se toca: lo usan las fichas PDF.
//
// Necesita potrace, que no es dependencia del proyecto:
//   npm i --no-save potrace && node scripts/generar-logo-ui.mjs
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const potrace = require("potrace");

const ORIGEN = "public/branding/mobiliarium-logo.png";
const ESCALA = 8; // se amplía antes de trazar para que las curvas salgan suaves
const TEXTO_CLARO = "#e9f2e1";

const { data, info } = await sharp(ORIGEN).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

// Estrella = píxeles verdes; texto y raya = el resto (gris). La cobertura es el
// alfa: en los bordes suavizados el píxel conserva su color y baja el alfa.
const esVerde = (i) => data[i + 1] > data[i] + 25 && data[i + 1] > data[i + 2] + 25;

let x0 = width, y0 = height, x1 = 0, y1 = 0;
const color = { verde: [0, 0, 0, 0], gris: [0, 0, 0, 0] };
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    const a = data[i + 3];
    if (a <= 10) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    if (a > 200) {
      const c = color[esVerde(i) ? "verde" : "gris"];
      c[0] += data[i]; c[1] += data[i + 1]; c[2] += data[i + 2]; c[3] += 1;
    }
  }
}
const margen = 2;
const caja = {
  left: Math.max(0, x0 - margen),
  top: Math.max(0, y0 - margen),
};
caja.width = Math.min(width, x1 + margen + 1) - caja.left;
caja.height = Math.min(height, y1 + margen + 1) - caja.top;

const hex = ([r, g, b, n]) =>
  "#" + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, "0")).join("");
const VERDE = hex(color.verde);
const GRIS = hex(color.gris);

// Máscara en escala de grises (negro = cubierto) de una de las dos capas.
async function mascara(esCapa) {
  const gris = Buffer.alloc(width * height, 255);
  for (let p = 0; p < width * height; p++) {
    const i = p * channels;
    const a = data[i + 3];
    if (a > 0 && esCapa(i)) gris[p] = 255 - a;
  }
  return sharp(gris, { raw: { width, height, channels: 1 } })
    .extract(caja)
    .resize(caja.width * ESCALA, caja.height * ESCALA, { kernel: "cubic" })
    .blur(1.2)
    .png()
    .toBuffer();
}

function trazar(png) {
  return new Promise((ok, fallo) =>
    potrace.trace(
      png,
      { threshold: 128, turdSize: 6, optTolerance: 0.4, alphaMax: 1.1, color: "#000", background: "transparent" },
      (error, svg) => {
        if (error) return fallo(error);
        ok([...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(" "));
      }
    )
  );
}

const trazoEstrella = await trazar(await mascara((i) => esVerde(i)));
const trazoTexto = await trazar(await mascara((i) => !esVerde(i)));

// La raya vertical fina entre la estrella y el texto mide ~1 px y se pierde al
// trazar: se detecta (la columna gris más alta) y se dibuja como rectángulo.
let raya = null;
for (let x = caja.left; x < caja.left + caja.width; x++) {
  const filas = [];
  for (let y = caja.top; y < caja.top + caja.height; y++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] > 40 && !esVerde(i)) filas.push(y);
  }
  const alto = filas.length ? filas.at(-1) - filas[0] + 1 : 0;
  // Debe ser una línea continua y alta (el texto, en cambio, tiene huecos).
  if (alto >= 20 && filas.length === alto && (!raya || alto > raya.alto)) {
    raya = { x, alto, y: filas[0] };
  }
}
const rectRaya = raya
  ? (c) =>
      `<rect fill="${c}" x="${(raya.x - caja.left + 0.15) * ESCALA}" y="${(raya.y - caja.top) * ESCALA}" width="${0.7 * ESCALA}" height="${raya.alto * ESCALA}"/>`
  : () => "";

const W = caja.width * ESCALA;
const H = caja.height * ESCALA;
const svg = (colorTexto) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${caja.width}" height="${caja.height}" role="img" aria-label="Mobiliarium — creating lifestyle">` +
  `<path fill="${VERDE}" fill-rule="evenodd" d="${trazoEstrella}"/>` +
  `<path fill="${colorTexto}" fill-rule="evenodd" d="${trazoTexto}"/>` +
  rectRaya(colorTexto) +
  `</svg>\n`;

writeFileSync("public/branding/mobiliarium-logo-ui.svg", svg(GRIS));
writeFileSync("public/branding/mobiliarium-logo-ui-claro.svg", svg(TEXTO_CLARO));
console.log({ caja, VERDE, GRIS, raya, bytes: svg(GRIS).length });
