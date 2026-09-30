import { describe, expect, it } from "vitest";
import { validarItemsParaRecibos } from "./validar-para-recibos";

type Fila = Parameters<typeof validarItemsParaRecibos>[0][number];

let fila = 10;
function item(
  codigo: number,
  cantidad: number,
  modelo: string | null = "DEC-1",
  tipo?: "MO" | "FU"
): Fila {
  fila += 1;
  return {
    item_code: codigo,
    tipo_registro: tipo ?? (Number.isInteger(codigo) ? "MO" : "FU"),
    modelo,
    cantidad_total: cantidad,
    fila_excel_origen: fila,
  };
}

describe("validarItemsParaRecibos", () => {
  it("un archivo limpio no genera avisos", () => {
    const avisos = validarItemsParaRecibos([
      item(1, 2),
      item(1.01, 4),
      item(1.02, 0.5), // los decimales en componentes son normales
      item(2, 1, "FX-7"),
    ]);
    expect(avisos).toEqual([]);
  });

  it("avisa de cantidades negativas, en padres y en componentes", () => {
    const avisos = validarItemsParaRecibos([item(1, -4), item(1.01, -1)]);
    expect(avisos).toHaveLength(2);
    expect(avisos[0].mensaje).toContain("negativa (-4)");
    expect(avisos[1].mensaje).toContain("negativa (-1)");
  });

  it("avisa de padres en cero, pero no de componentes en cero", () => {
    const avisos = validarItemsParaRecibos([item(1, 0), item(1.01, 0)]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensaje).toContain("en 0");
  });

  it("avisa de decimales solo en padres", () => {
    const avisos = validarItemsParaRecibos([item(1, 2.5), item(1.01, 3.3)]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensaje).toContain("decimales (2.5)");
  });

  it("avisa de muebles sin modelo", () => {
    const avisos = validarItemsParaRecibos([item(1, 1, null), item(1.01, 1, null)]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensaje).toContain("sin MODELO");
  });

  it("avisa de componentes sin mueble padre", () => {
    const avisos = validarItemsParaRecibos([item(1, 1), item(1.01, 1), item(7.02, 1, "X")]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensaje).toContain("sin mueble padre");
    expect(avisos[0].mensaje).toContain("ítem 7");
  });

  it("limita los avisos por tipo y resume el resto", () => {
    const sucios = Array.from({ length: 40 }, (_, i) => item(i + 1, -1, `M-${i}`));
    const avisos = validarItemsParaRecibos(sucios);
    expect(avisos).toHaveLength(16); // 15 listados + 1 resumen
    expect(avisos[15].fila).toBe(0);
    expect(avisos[15].mensaje).toContain("25 filas más");
  });
});
