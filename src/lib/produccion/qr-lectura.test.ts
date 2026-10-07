import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { itemDeQrViajero } from "./qr-viajero";

const PEDIDO = "0b9a7f5e-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
const ITEM = "7d6c5b4a-3f2e-4d1c-9b8a-7f6e5d4c3b2a";
// Igual de largo que el que imprime la hoja de viajero (base + ruta con dos uuid).
const URL_VIAJERO = `https://erp-becario.vercel.app/produccion/pedidos/${PEDIDO}/viajero/${ITEM}`;

// Lo mismo que hace el escáner: píxeles RGBA -> texto del QR.
async function leer(png: Buffer, anchoFinal?: number): Promise<string | null> {
  let imagen = sharp(png).flatten({ background: "#ffffff" });
  if (anchoFinal) imagen = imagen.resize({ width: anchoFinal, kernel: "lanczos3" });
  const { data, info } = await imagen.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

describe("lectura del QR de la hoja de viajero", () => {
  it("lo que imprime la hoja se lee y da los ids del mueble", async () => {
    const png = await QRCode.toBuffer(URL_VIAJERO, { margin: 1, width: 440 });
    const texto = await leer(png);
    expect(texto).toBe(URL_VIAJERO);
    expect(itemDeQrViajero(texto!)).toEqual({ pedidoId: PEDIDO, itemId: ITEM });
  });

  it("se sigue leyendo al reducirlo, como en la foto de una hoja impresa", async () => {
    const png = await QRCode.toBuffer(URL_VIAJERO, { margin: 1, width: 440 });
    expect(await leer(png, 220)).toBe(URL_VIAJERO);
  });
});
