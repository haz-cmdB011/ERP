import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { comprimirImagenGrande, comprimirImagenItem } from "./optimizar-almacenamiento";
import { rutaImagenGrande } from "./imagenes";

// Imagen sintética de 3000x2000 (más grande que cualquier límite) con ruido,
// para que la compresión no la reduzca a casi nada.
async function imagenGrandeDePrueba(ancho = 3000, alto = 2000): Promise<Buffer> {
  return sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .png()
    .toBuffer();
}

describe("versiones de imagen de ítems", () => {
  it("la miniatura queda acotada a 600 px y la grande a 1600 px, ambas WebP", async () => {
    const original = await imagenGrandeDePrueba();

    const miniatura = await comprimirImagenItem(original, "png");
    const grande = await comprimirImagenGrande(original);

    expect(miniatura.extension).toBe("webp");
    const metaMini = await sharp(miniatura.buffer).metadata();
    expect(Math.max(metaMini.width ?? 0, metaMini.height ?? 0)).toBe(600);

    expect(grande).not.toBeNull();
    const metaGrande = await sharp(grande as Buffer).metadata();
    expect(metaGrande.format).toBe("webp");
    expect(Math.max(metaGrande.width ?? 0, metaGrande.height ?? 0)).toBe(1600);
  });

  it("no agranda una imagen que ya es más chica que el límite", async () => {
    const chica = await imagenGrandeDePrueba(400, 300);
    const grande = await comprimirImagenGrande(chica);
    const meta = await sharp(grande as Buffer).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("devuelve null (sin lanzar) si el buffer no es una imagen", async () => {
    expect(await comprimirImagenGrande(Buffer.from("no soy una imagen"))).toBeNull();
  });

  it("deriva la ruta de la versión grande junto a la miniatura", () => {
    expect(rutaImagenGrande("abc-123/12-0.webp")).toBe("abc-123/12-0-hd.webp");
    expect(rutaImagenGrande("abc-123/12-1.png")).toBe("abc-123/12-1-hd.webp");
  });
});
