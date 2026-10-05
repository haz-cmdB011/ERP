import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { comprimirFotoEntrega } from "./foto-entrega";

describe("comprimirFotoEntrega", () => {
  it("reduce una foto grande a WebP de 1800 px como máximo", async () => {
    const original = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 180, b: 160 } },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const comprimida = await comprimirFotoEntrega(original);
    expect(comprimida).not.toBeNull();
    const meta = await sharp(comprimida!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1800);
    expect(meta.height).toBe(1350);
  });

  it("no agranda una foto chica", async () => {
    const original = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const meta = await sharp((await comprimirFotoEntrega(original))!).metadata();
    expect(meta.width).toBe(800);
  });

  it("devuelve null si no es imagen", async () => {
    expect(await comprimirFotoEntrega(Buffer.from("no soy una imagen"))).toBeNull();
  });
});
