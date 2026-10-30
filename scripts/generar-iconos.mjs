// Genera los íconos de la app (pestaña del navegador, PWA / "agregar a pantalla de
// inicio", iOS) a partir de la estrella real del logotipo
// (la primera forma de public/branding/mobiliarium-logo-ui.svg): node scripts/generar-iconos.mjs
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const FONDO = "#7cfc00";
const ESTRELLA = "#0b1f00";

// La estrella es la primera forma del logo; se vuelve a dibujar sola y se recorta a su caja.
const logo = readFileSync("public/branding/mobiliarium-logo-ui.svg", "utf8");
const [, viewBox] = logo.match(/viewBox="([^"]+)"/);
const [, , ancho, alto] = viewBox.split(" ").map(Number);
const estrellaSvg = logo.match(/<path[^>]*\/>/)[0].replace(/fill="[^"]*"/, `fill="${ESTRELLA}"`);
const lienzo = 4; // se dibuja grande para recortar con precisión
const estrella = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${ancho * lienzo}" height="${alto * lienzo}">${estrellaSvg}</svg>`,
  ),
)
  .png()
  .trim()
  .toBuffer();
const { width: ew, height: eh } = await sharp(estrella).metadata();

// `margen`: aire alrededor de la estrella (los íconos "maskable" de Android recortan los
// bordes); `redondeo`: radio de las esquinas, en fracción del lado.
async function icono(tam, { margen, redondeo }) {
  const lado = Math.round(tam * (1 - 2 * margen));
  const pieza = await sharp(estrella)
    .resize(lado, lado, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  const fondo = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}"><rect width="${tam}" height="${tam}" rx="${tam * redondeo}" fill="${FONDO}"/></svg>`,
  );
  return sharp(fondo)
    .composite([
      {
        input: pieza.data,
        left: Math.round((tam - pieza.info.width) / 2),
        top: Math.round((tam - pieza.info.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

const salidas = [
  ["public/icons/icon-192.png", 192, { margen: 0.2, redondeo: 0.19 }],
  ["public/icons/icon-512.png", 512, { margen: 0.2, redondeo: 0.19 }],
  ["public/icons/icon-maskable-512.png", 512, { margen: 0.3, redondeo: 0 }],
  // iOS redondea solo las esquinas: el ícono va a sangre.
  ["src/app/apple-icon.png", 180, { margen: 0.2, redondeo: 0 }],
  ["src/app/icon.png", 256, { margen: 0.16, redondeo: 0.19 }],
];
for (const [ruta, tam, opciones] of salidas) {
  writeFileSync(ruta, await icono(tam, opciones));
  console.log(ruta);
}

// favicon.ico: varios tamaños en PNG dentro del contenedor ICO.
const tamanos = [16, 32, 48];
const pngs = await Promise.all(tamanos.map((t) => icono(t, { margen: 0.08, redondeo: 0.19 })));
const cabecera = Buffer.alloc(6 + 16 * pngs.length);
cabecera.writeUInt16LE(1, 2);
cabecera.writeUInt16LE(pngs.length, 4);
let desplazamiento = cabecera.length;
pngs.forEach((png, i) => {
  const o = 6 + 16 * i;
  cabecera.writeUInt8(tamanos[i], o);
  cabecera.writeUInt8(tamanos[i], o + 1);
  cabecera.writeUInt16LE(1, o + 4);
  cabecera.writeUInt16LE(32, o + 6);
  cabecera.writeUInt32LE(png.length, o + 8);
  cabecera.writeUInt32LE(desplazamiento, o + 12);
  desplazamiento += png.length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([cabecera, ...pngs]));
console.log("src/app/favicon.ico", ew, eh);
