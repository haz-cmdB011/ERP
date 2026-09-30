import { describe, expect, it } from "vitest";
import { compararVersiones, type ItemComparable } from "./diff-versiones";

let siguienteId = 0;

function mueble(itemCode: number, modelo: string | null, extra: Partial<ItemComparable> = {}): ItemComparable {
  return {
    id: `id-${siguienteId++}`,
    parentId: null,
    itemCode,
    tipoRegistro: "MO",
    modelo,
    descripcion: `MUEBLE ${modelo ?? itemCode}`,
    tipoMaterial: "HIBRIDO",
    etapa: "3",
    nivel: "AZOTEA",
    departamento: "COMEDOR",
    elevacion: null,
    cantidadXMueble: null,
    unidad: "PZA",
    cantidadTotal: 1,
    acabados: null,
    observaciones: null,
    fila: itemCode * 10,
    ...extra,
  };
}

function componente(
  padre: ItemComparable,
  posicion: number,
  descripcion: string,
  extra: Partial<ItemComparable> = {}
): ItemComparable {
  const itemCode = Math.floor(padre.itemCode) + posicion / 100;
  return {
    ...padre,
    id: `id-${siguienteId++}`,
    parentId: padre.id,
    itemCode,
    tipoRegistro: "FU",
    descripcion,
    tipoMaterial: "MADERA",
    cantidadXMueble: 1,
    cantidadTotal: padre.cantidadTotal,
    fila: (padre.fila ?? 0) + posicion,
    ...extra,
  };
}

// Copia profunda con ids nuevos, como hace cada carga en la base.
function nuevaVersion(items: ItemComparable[]): ItemComparable[] {
  const ids = new Map(items.map((i) => [i.id, `id-${siguienteId++}`]));
  return items.map((i) => ({
    ...i,
    id: ids.get(i.id)!,
    parentId: i.parentId ? ids.get(i.parentId)! : null,
  }));
}

function versionBase(): ItemComparable[] {
  const pergola = mueble(1, "PG-01", { cantidadTotal: 13, acabados: "WD-01 = CHAPA ENCINO" });
  const puerta = mueble(2, "PSMA-01 (85)", { cantidadTotal: 1 });
  return [
    pergola,
    componente(pergola, 1, "TABLA DE MDF DE 250 X 2400 MM", { cantidadXMueble: 3, cantidadTotal: 39 }),
    componente(pergola, 2, "HERRAJE PARA PÉRGOLA", { tipoMaterial: "METAL", cantidadTotal: 13 }),
    puerta,
    componente(puerta, 1, "PUERTA CON MARCO"),
    componente(puerta, 2, "PLACA DE PATEO", { tipoMaterial: "METAL", cantidadXMueble: 2, cantidadTotal: 2 }),
  ];
}

describe("compararVersiones", () => {
  it("sin cambios", () => {
    const v1 = versionBase();
    const { cambios, resumen } = compararVersiones(v1, nuevaVersion(v1));
    expect(cambios).toEqual([]);
    expect(resumen.mueblesSinCambios).toBe(2);
    expect(resumen.mueblesModificados).toBe(0);
  });

  it("no cuenta como cambio espacios, mayúsculas ni acentos", () => {
    const v1 = versionBase();
    const v2 = nuevaVersion(v1).map((i) =>
      i.descripcion === "HERRAJE PARA PÉRGOLA" ? { ...i, descripcion: "  herraje   para pergola " } : i
    );
    expect(compararVersiones(v1, v2).cambios).toEqual([]);
  });

  it("detecta el cambio de cantidad del mueble y marca como derivadas las de sus componentes", () => {
    const v1 = versionBase();
    // Pérgola 13 → 15: tabla (3 por mueble) 39 → 45 y herraje 13 → 15.
    const nuevas = new Map([[39, 45], [13, 15]]);
    const v2 = nuevaVersion(v1).map((i) =>
      i.modelo === "PG-01" ? { ...i, cantidadTotal: nuevas.get(i.cantidadTotal)! } : i
    );
    const { cambios, resumen } = compararVersiones(v1, v2);

    expect(cambios).toHaveLength(1);
    const [pergola] = cambios;
    expect(pergola.tipo).toBe("modificado");
    expect(pergola.campos).toEqual([{ campo: "cantidadTotal", antes: 13, despues: 15 }]);
    // Tabla 39 → 45 y herraje 13 → 15: derivados de la cantidad del mueble.
    expect(pergola.componentes.map((c) => c.derivado)).toEqual([true, true]);
    expect(resumen.componentesModificados).toBe(0);
  });

  it("un cambio de acabado en un componente sí cuenta", () => {
    const v1 = versionBase();
    const v2 = nuevaVersion(v1).map((i) =>
      i.descripcion === "PUERTA CON MARCO" ? { ...i, acabados: "PL-01 = FROSTY WHITE" } : i
    );
    const { cambios, resumen } = compararVersiones(v1, v2);

    expect(cambios).toHaveLength(1);
    expect(cambios[0].despues?.modelo).toBe("PSMA-01 (85)");
    expect(cambios[0].campos).toEqual([]);
    expect(cambios[0].componentes).toMatchObject([
      { tipo: "modificado", derivado: false, campos: [{ campo: "acabados", despues: "PL-01 = FROSTY WHITE" }] },
    ]);
    expect(resumen.componentesModificados).toBe(1);
  });

  it("un mueble insertado recorre los números sin marcar los demás como modificados", () => {
    const v1 = versionBase();
    const recorridos = nuevaVersion(v1).map((i) => ({
      ...i,
      itemCode: i.itemCode + 1,
      fila: (i.fila ?? 0) + 10,
    }));
    const nuevo = mueble(1, "BARRA-01", { fila: 5 });
    const { cambios, resumen } = compararVersiones(v1, [nuevo, ...recorridos]);

    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ tipo: "agregado", despues: { modelo: "BARRA-01" } });
    expect(resumen).toMatchObject({ mueblesAgregados: 1, mueblesModificados: 0, mueblesSinCambios: 2, renumerados: 2 });
  });

  it("un mueble quitado lleva consigo sus componentes", () => {
    const v1 = versionBase();
    const v2 = nuevaVersion(v1).filter((i) => i.modelo !== "PSMA-01 (85)");
    const { cambios, resumen } = compararVersiones(v1, v2);

    expect(cambios).toHaveLength(1);
    expect(cambios[0].tipo).toBe("quitado");
    expect(cambios[0].componentes.map((c) => c.tipo)).toEqual(["quitado", "quitado"]);
    // Los componentes de un mueble quitado no se cuentan aparte.
    expect(resumen).toMatchObject({ mueblesQuitados: 1, componentesQuitados: 0 });
  });

  it("un componente insertado en medio no altera a los que se recorrieron", () => {
    const v1 = versionBase();
    const v2 = nuevaVersion(v1);
    const pergola = v2.find((i) => i.modelo === "PG-01" && i.tipoRegistro === "MO")!;
    const herraje = v2.find((i) => i.descripcion === "HERRAJE PARA PÉRGOLA")!;
    herraje.itemCode = 1.03;
    v2.push(componente(pergola, 2, "CRISTAL TEMPLADO 6 MM", { tipoMaterial: "VIDRIO" }));
    const { cambios, resumen } = compararVersiones(v1, v2);

    expect(cambios).toHaveLength(1);
    expect(cambios[0].componentes).toMatchObject([
      { tipo: "agregado", despues: { descripcion: "CRISTAL TEMPLADO 6 MM" } },
    ]);
    expect(resumen).toMatchObject({ componentesAgregados: 1, componentesModificados: 0 });
  });

  it("empareja por posición un componente cuya descripción se corrigió", () => {
    const v1 = versionBase();
    const v2 = nuevaVersion(v1).map((i) =>
      i.descripcion === "PLACA DE PATEO" ? { ...i, descripcion: "PLACA DE PATEO INOX" } : i
    );
    const { cambios } = compararVersiones(v1, v2);

    expect(cambios[0].componentes).toMatchObject([
      {
        tipo: "modificado",
        campos: [{ campo: "descripcion", antes: "PLACA DE PATEO", despues: "PLACA DE PATEO INOX" }],
      },
    ]);
  });

  it("reconoce un componente al que solo le cambiaron el tipo", () => {
    const v1 = versionBase();
    const v2 = nuevaVersion(v1).map((i) =>
      i.descripcion === "PLACA DE PATEO" ? { ...i, tipoMaterial: "COMPRAS" } : i
    );
    const { cambios, resumen } = compararVersiones(v1, v2);

    expect(resumen).toMatchObject({ componentesAgregados: 0, componentesQuitados: 0, componentesModificados: 1 });
    expect(cambios[0].componentes[0].campos).toEqual([
      { campo: "tipoMaterial", antes: "METAL", despues: "COMPRAS" },
    ]);
  });

  it("reconoce un modelo renombrado con el mismo número y descripción", () => {
    const v1 = versionBase();
    const v2 = nuevaVersion(v1).map((i) =>
      i.modelo === "PSMA-01 (85)" && i.tipoRegistro === "MO" ? { ...i, modelo: "PSMA-02 (85)" } : i
    );
    const { cambios, resumen } = compararVersiones(v1, v2);

    expect(resumen).toMatchObject({ mueblesAgregados: 0, mueblesQuitados: 0, mueblesModificados: 1 });
    expect(cambios[0].campos).toEqual([
      { campo: "modelo", antes: "PSMA-01 (85)", despues: "PSMA-02 (85)" },
    ]);
  });

  it("un modelo distinto con otra descripción es un mueble nuevo, no un cambio", () => {
    const v1 = versionBase();
    const v2 = nuevaVersion(v1).map((i) =>
      i.modelo === "PSMA-01 (85)" && i.tipoRegistro === "MO"
        ? { ...i, modelo: "LOCKER-01", descripcion: "LOCKER DE 6 PUERTAS" }
        : i
    );
    const { resumen } = compararVersiones(v1, v2);
    expect(resumen).toMatchObject({ mueblesAgregados: 1, mueblesQuitados: 1, mueblesModificados: 0 });
  });

  it("con varios muebles del mismo modelo, empareja por número de ítem y ubicación", () => {
    const a1 = mueble(1, "PSTA01 (90)", { departamento: "BAÑO H" });
    const a2 = mueble(2, "PSTA01 (90)", { departamento: "BAÑO M" });
    const a3 = mueble(3, "PSTA01 (90)", { departamento: "BODEGA" });
    const v1 = [a1, a2, a3];
    // En la versión nueva se quita la puerta del baño H y la de bodega pasa a 2 piezas.
    const v2 = nuevaVersion([a2, a3]).map((i) => ({
      ...i,
      itemCode: i.itemCode - 1,
      cantidadTotal: i.departamento === "BODEGA" ? 2 : i.cantidadTotal,
    }));
    const { cambios, resumen } = compararVersiones(v1, v2);

    expect(resumen).toMatchObject({ mueblesQuitados: 1, mueblesModificados: 1, mueblesSinCambios: 1 });
    expect(cambios.find((c) => c.tipo === "quitado")?.antes?.departamento).toBe("BAÑO H");
    expect(cambios.find((c) => c.tipo === "modificado")?.campos).toEqual([
      { campo: "cantidadTotal", antes: 1, despues: 2 },
    ]);
  });

  it("con varios del mismo modelo, no empareja un sobrante que no tiene nada en común", () => {
    // Caso real (PM 009-26, 03.08.26): un componente capturado como ítem "13"
    // entero quedó como otro mueble PSTA02 (105).
    const puerta12 = mueble(12, "PSTA02 (105)", { departamento: "BODEGA (JUNTO A ELEVADORES)" });
    const falso13 = mueble(13, "PSTA02 (105)", {
      descripcion: "CIERRA-PUERTAS MARCA JAKO",
      departamento: "BODEGA (JUNTO A CAJA PRINCIPAL)",
    });
    const v1 = [puerta12, falso13];
    const [puerta12v2] = nuevaVersion([puerta12]);
    const puerta5 = mueble(5, "PSTA02 (105)", { departamento: "BODEGA (ANTES PAQUETERÍA)" });
    const { cambios, resumen } = compararVersiones(v1, [puerta5, puerta12v2]);

    expect(resumen).toMatchObject({ mueblesAgregados: 1, mueblesQuitados: 1, mueblesSinCambios: 1 });
    expect(cambios.find((c) => c.tipo === "quitado")?.antes?.itemCode).toBe(13);
    expect(cambios.find((c) => c.tipo === "agregado")?.despues?.itemCode).toBe(5);
  });

  it("los componentes sin mueble se comparan como elementos sueltos", () => {
    const suelto: ItemComparable = { ...mueble(7, "M-07"), tipoRegistro: "FU", itemCode: 7.01 };
    const v2 = nuevaVersion([suelto]).map((i) => ({ ...i, cantidadTotal: 4 }));
    const { cambios } = compararVersiones([suelto], v2);
    expect(cambios).toMatchObject([
      { tipo: "modificado", campos: [{ campo: "cantidadTotal", antes: 1, despues: 4 }] },
    ]);
  });
});
