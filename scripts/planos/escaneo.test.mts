import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pmDeRuta, recorrerServidor } from "./escaneo.mts";

describe("recorrerServidor", () => {
  it("junta los PDF de todas las carpetas, a cualquier profundidad", async () => {
    const raiz = await mkdtemp(path.join(tmpdir(), "planos-"));
    const planos = path.join(raiz, "O. T´s. 2025", "PM 1", "INGENIERIA", "PLA-07", "PLANOS");
    const catalogo = path.join(raiz, "CATALOGO", "sub");
    await mkdir(planos, { recursive: true });
    await mkdir(catalogo, { recursive: true });
    await writeFile(path.join(planos, "PLA-07.pdf"), "x");
    await writeFile(path.join(catalogo, "MESA.PDF"), "x");
    await writeFile(path.join(catalogo, "nota.txt"), "x");

    const r = await recorrerServidor(raiz, () => {});

    expect(r.pdfs.map((p) => p.ruta_origen).sort()).toEqual([
      "CATALOGO\\sub\\MESA.PDF",
      "O. T´s. 2025\\PM 1\\INGENIERIA\\PLA-07\\PLANOS\\PLA-07.pdf",
    ]);
    expect(r.pdfs.find((p) => p.nombre === "MESA.PDF")?.carpeta).toBe("sub");
    expect(r.inaccesibles).toEqual([]);
  });
});

describe("pmDeRuta", () => {
  it("toma el PM de la carpeta de proyecto, aunque el archivo esté más adentro", () => {
    expect(pmDeRuta("O. T´s. 2025\\PM 168-25 REMODELACIÓN  PH MONTERREY\\DIAGRAMAS U\\FX-01.pdf")).toBe("PM168-25");
  });

  it("sin carpeta de proyecto con PM, o fuera de la estructura de OT, es null", () => {
    expect(pmDeRuta("CATALOGO SMART FIT\\INGENIERIA\\P-COL\\P-COL.PDF")).toBeNull();
    expect(pmDeRuta("O. T´s. 2024\\115-26-2 CORNER JBE\\FX-01.pdf")).toBeNull();
    expect(pmDeRuta("O. T´s. 2025\\FX-01.pdf")).toBeNull();
  });
});
