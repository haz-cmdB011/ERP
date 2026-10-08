import { describe, expect, it } from "vitest";
import { claveDeHoja, hojasParaCargar } from "./hojas-carga";

const hoja = (nombreHoja: string, oculta = false) => ({ nombreHoja, oculta });

describe("hojasParaCargar", () => {
  // PM_013-26 ... SALON 02: "PEDIDO" visible, "incidencias" y "X FECHAS" ocultas.
  const salon2 = [hoja("incidencias", true), hoja("PEDIDO"), hoja("X FECHAS", true)];

  it("sin subir las ocultas carga solo las visibles y dice cuáles omitió", () => {
    const { cargar, omitidas } = hojasParaCargar(salon2, false);
    expect(cargar.map((h) => h.nombreHoja)).toEqual(["PEDIDO"]);
    expect(omitidas).toEqual(["incidencias", "X FECHAS"]);
  });

  it("al subirlas, las visibles van primero", () => {
    const { cargar, omitidas } = hojasParaCargar(salon2, true);
    expect(cargar.map((h) => h.nombreHoja)).toEqual(["PEDIDO", "incidencias", "X FECHAS"]);
    expect(omitidas).toEqual([]);
  });
});

describe("claveDeHoja", () => {
  const archivo = "PM OT 114-26 PLAFON DECORATIVO ACCESOS CC PERISUR.xlsx";
  const base = "PM OT 114-26 PLAFON DECORATIVO ACCESOS CC PERISUR";

  it("con una sola hoja visible basta el nombre del archivo", () => {
    const hojas = [hoja("PEDIDO"), hoja("incidencias", true)];
    expect(claveDeHoja(archivo, hojas, hojas[0])).toBe(base);
    expect(claveDeHoja(archivo, hojas, hojas[1])).toBe(`${base} :: INCIDENCIAS`);
  });

  it("con varias visibles todas llevan su nombre, también la primera", () => {
    const hojas = [hoja("ETAPA 1"), hoja("ETAPA 2")];
    expect(hojas.map((h) => claveDeHoja(archivo, hojas, h))).toEqual([
      `${base} :: ETAPA 1`,
      `${base} :: ETAPA 2`,
    ]);
  });

  it("agregar una hoja antes no cambia la clave de las demás", () => {
    const antes = [hoja("ETAPA 1"), hoja("ETAPA 2")];
    const despues = [hoja("ETAPA 0"), hoja("ETAPA 1"), hoja("ETAPA 2")];
    expect(claveDeHoja(archivo, despues, despues[1])).toBe(claveDeHoja(archivo, antes, antes[0]));
  });

  it("subir o no las ocultas no cambia la clave de la visible", () => {
    const conOculta = [hoja("PEDIDO"), hoja("X FECHAS", true)];
    expect(claveDeHoja(archivo, conOculta, conOculta[0])).toBe(claveDeHoja(archivo, [hoja("PEDIDO")], hoja("PEDIDO")));
  });
});
