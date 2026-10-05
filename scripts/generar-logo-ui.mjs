// Genera el logotipo para la interfaz a partir de public/branding/mobiliarium-logo.png
// (el original se queda intacto: lo usan las fichas PDF).
//  - mobiliarium-logo-ui.png: recortado a su contenido (sin márgenes transparentes).
//  - mobiliarium-logo-ui-claro.png: igual, pero con el texto gris aclarado para
//    leerse sobre la barra oscura; la estrella conserva su verde.
// Uso: node scripts/generar-logo-ui.mjs
import sharp from "sharp";

const origen = "public/branding/mobiliarium-logo.png";
const { data, info } = await sharp(origen).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

let x0 = width, y0 = height, x1 = 0, y1 = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * channels + 3] > 10) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
}
const margen = 2;
const recorte = {
  left: Math.max(0, x0 - margen),
  top: Math.max(0, y0 - margen),
  width: Math.min(width, x1 + margen + 1) - Math.max(0, x0 - margen),
  height: Math.min(height, y1 + margen + 1) - Math.max(0, y0 - margen),
};

await sharp(origen).extract(recorte).png().toFile("public/branding/mobiliarium-logo-ui.png");

// Texto claro: los píxeles que no son verdes (gris) pasan a un blanco verdoso.
const claro = Buffer.from(data);
for (let i = 0; i < claro.length; i += channels) {
  const [r, g, b] = [claro[i], claro[i + 1], claro[i + 2]];
  const esVerde = g > r + 25 && g > b + 25;
  if (!esVerde) { claro[i] = 0xe9; claro[i + 1] = 0xf2; claro[i + 2] = 0xe1; }
}
await sharp(claro, { raw: { width, height, channels } })
  .extract(recorte)
  .png()
  .toFile("public/branding/mobiliarium-logo-ui-claro.png");

console.log("recorte", recorte);
