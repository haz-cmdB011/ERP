import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { itemDeQrViajero } from "./qr-viajero";

const PEDIDO = "0b9a7f5e-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
const ITEM = "7d6c5b4a-3f2e-4d1c-9b8a-7f6e5d4c3b2a";
// Igual de largo que el que imprime la hoja de viajero (base + ruta con dos uuid).
const URL_VIAJERO = `https://erp-becario.vercel.app/produccion/pedidos/${PEDIDO}/viajero/${ITEM}`;

// Lo que lleva el QR de las hojas nuevas: solo el id del ítem.
const URL_CORTA = `https://erp-becario.vercel.app/q/${ITEM}`;

// Cuántos módulos (cuadritos) por lado tiene el QR: menos módulos = cada uno más grande al imprimir.
function modulos(texto: string): number {
  return QRCode.create(texto, { errorCorrectionLevel: "M" }).modules.size;
}

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

  it("el QR corto es mucho menos denso que el de la dirección larga", () => {
    // Un código más ralo tiene cuadritos más grandes a igual tamaño impreso: lo lee el celular.
    expect(modulos(URL_CORTA)).toBeLessThan(modulos(URL_VIAJERO));
    expect(modulos(URL_CORTA)).toBeLessThanOrEqual(37);
    expect(modulos(URL_VIAJERO)).toBeGreaterThanOrEqual(45);
  });

  it("el QR corto se lee y da el ítem (sin pedido)", async () => {
    const png = await QRCode.toBuffer(URL_CORTA, { margin: 3, scale: 8 });
    const texto = await leer(png);
    expect(texto).toBe(URL_CORTA);
    expect(itemDeQrViajero(texto!)).toEqual({ pedidoId: null, itemId: ITEM });
  });

  it("el QR corto se sigue leyendo a un tamaño chico, como impreso en la hoja", async () => {
    const png = await QRCode.toBuffer(URL_CORTA, { margin: 3, scale: 8 });
    expect(await leer(png, 150)).toBe(URL_CORTA);
  });

  it("se sigue leyendo al reducirlo, como en la foto de una hoja impresa", async () => {
    const png = await QRCode.toBuffer(URL_VIAJERO, { margin: 1, width: 440 });
    expect(await leer(png, 220)).toBe(URL_VIAJERO);
  });
});
