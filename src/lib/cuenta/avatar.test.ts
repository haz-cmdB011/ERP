import { describe, expect, it } from "vitest";
import { nuevaRutaAvatar, rutaAvatarValida } from "./avatar";
import { normalizarNombre } from "./nombre";

const USER = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const OTRO = "11111111-2222-4333-8444-555555555555";

describe("rutaAvatarValida", () => {
  it("acepta la ruta propia", () => {
    expect(rutaAvatarValida(USER, nuevaRutaAvatar(USER, 1700000000000))).toBe(true);
  });
  it("rechaza la carpeta de otro usuario", () => {
    expect(rutaAvatarValida(USER, `${OTRO}/1.webp`)).toBe(false);
  });
  it("rechaza recorridos, extensiones raras y valores que no son texto", () => {
    expect(rutaAvatarValida(USER, `${USER}/../${OTRO}/1.webp`)).toBe(false);
    expect(rutaAvatarValida(USER, `${USER}/1.png`)).toBe(false);
    expect(rutaAvatarValida(USER, null)).toBe(false);
    expect(rutaAvatarValida(USER, 42)).toBe(false);
  });
});

describe("normalizarNombre", () => {
  it("quita espacios de más", () => {
    expect(normalizarNombre("  Ana   María  López ")).toBe("Ana María López");
  });
  it("rechaza vacío, muy corto, muy largo y no texto", () => {
    expect(normalizarNombre("   ")).toBeNull();
    expect(normalizarNombre("A")).toBeNull();
    expect(normalizarNombre("x".repeat(81))).toBeNull();
    expect(normalizarNombre(undefined)).toBeNull();
  });
});
