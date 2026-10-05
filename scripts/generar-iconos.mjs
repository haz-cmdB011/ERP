// Genera los íconos de la app (PWA / "agregar a pantalla de inicio") a partir
// de la estrella de la marca: node scripts/generar-iconos.mjs
import sharp from "sharp";

const VERDE = "#7cfc00";
const OSCURO = "#0b1f00";

// `margen` deja aire alrededor (los íconos "maskable" de Android recortan los
// bordes en círculo o cuadrado redondeado); `redondeo` redondea las esquinas.
function svg({ margen, redondeo }) {
  const lado = 512 - margen * 2;
  const k = lado / 32;
  const trazo = (d) =>
    `<path d="${d}" stroke="${OSCURO}" stroke-width="3" stroke-linecap="round" fill="none" transform="translate(${margen} ${margen}) scale(${k})"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${redondeo}" fill="${VERDE}"/>
  ${trazo("M16 3v26M3 16h26M6.8 6.8l18.4 18.4M25.2 6.8 6.8 25.2")}
</svg>`;
}

const salidas = [
  ["public/icons/icon-192.png", 192, { margen: 96, redondeo: 96 }],
  ["public/icons/icon-512.png", 512, { margen: 96, redondeo: 96 }],
  ["public/icons/icon-maskable-512.png", 512, { margen: 150, redondeo: 0 }],
  // iOS redondea solo las esquinas: el ícono va a sangre.
  ["src/app/apple-icon.png", 180, { margen: 40, redondeo: 0 }],
  ["src/app/icon.png", 256, { margen: 48, redondeo: 48 }],
];
for (const [ruta, tam, opciones] of salidas) {
  await sharp(Buffer.from(svg(opciones))).resize(tam, tam).png().toFile(ruta);
  console.log(ruta);
}
