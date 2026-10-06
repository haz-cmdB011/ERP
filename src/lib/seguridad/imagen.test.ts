import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { detectarFormatoImagen } from "./imagen";

const relleno = (...bytes: number[]) => Buffer.from([...bytes, ...new Array(16).fill(0)]);

describe("detectarFormatoImagen", () => {
  it("reconoce los cuatro formatos por su firma", () => {
    expect(detectarFormatoImagen(relleno(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(detectarFormatoImagen(relleno(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(detectarFormatoImagen(Buffer.from("RIFF....WEBPVP8 "))).toBe("webp");
    expect(detectarFormatoImagen(Buffer.from("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000"))).toBe("gif");
  });

  it("rechaza SVG, PDF, texto y archivos vacíos aunque se declaren como imagen", () => {
    expect(detectarFormatoImagen(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>'))).toBeNull();
    expect(detectarFormatoImagen(Buffer.from("%PDF-1.7 ......................"))).toBeNull();
    expect(detectarFormatoImagen(Buffer.from("hola mundo, esto no es una imagen"))).toBeNull();
    expect(detectarFormatoImagen(Buffer.alloc(0))).toBeNull();
  });

  it("reconoce imágenes reales generadas por sharp", async () => {
    const base = { create: { width: 8, height: 8, channels: 3 as const, background: "#7cfc00" } };
    expect(detectarFormatoImagen(await sharp(base).png().toBuffer())).toBe("png");
    expect(detectarFormatoImagen(await sharp(base).jpeg().toBuffer())).toBe("jpeg");
    expect(detectarFormatoImagen(await sharp(base).webp().toBuffer())).toBe("webp");
  });
});
