import { describe, expect, it } from "vitest";
import type { ItemComparable } from "./diff-versiones";
import {
  aComparables,
  calcularImpacto,
  describirCambios,
  necesitaConfirmacion,
  type EstadoItemEnMarcha,
} from "./impacto-version";
import type { PlaneacionItemParsed } from "./types";

function parseado(fila: number, itemCode: number, extra: Partial<PlaneacionItemParsed> = {}): PlaneacionItemParsed {
  return {
    item_code: itemCode,
    tipo_registro: Number.isInteger(itemCode) ? "MO" : "FU",
    categoria_componente: null,
    tipo_material: "MADERA",
    etapa: null,
    nivel: null,
    departamento: null,
    elevacion: null,
    modelo: `Modelo ${itemCode}`,
    descripcion: `Descripción ${itemCode}`,
    cantidad_x_mueble: null,
    unidad: "PZA",
    cantidad_total: 10,
    acabados: null,
    observaciones: null,
    fila_excel_origen: fila,
    imagenes: [],
    ingenieria: null,
    lista_insumos: null,
    suministro_mats: null,
    fases_taller: {},
    ...extra,
  };
}

// Un ítem de la versión activa (como sale de la base), con el mismo contenido
// que `parseado` para poder armar versiones iguales o con diferencias.
function existente(id: string, fila: number, itemCode: number, extra: Partial<ItemComparable> = {}): ItemComparable {
  return {
    id,
    parentId: null,
    itemCode,
    tipoRegistro: Number.isInteger(itemCode) ? "MO" : "FU",
    modelo: `Modelo ${itemCode}`,
    descripcion: `Descripción ${itemCode}`,
    tipoMaterial: "MADERA",
    etapa: null,
    nivel: null,
    departamento: null,
    elevacion: null,
    cantidadXMueble: null,
    unidad: "PZA",
    cantidadTotal: 10,
    acabados: null,
    observaciones: null,
    fila,
    ...extra,
  };
}

const sinTrabajo = new Map<string, EstadoItemEnMarcha>();
const base = { hoja: "PEDIDO", numeroPedido: "1PM134-26", versionActiva: 2, versionNueva: 3 };

describe("aComparables", () => {
  it("ata cada componente al mueble de su parte entera", () => {
    const [m1, c11, c12, m2, c21] = aComparables([
      parseado(10, 1),
      parseado(11, 1.01),
      parseado(12, 1.02),
      parseado(13, 2),
      parseado(14, 2.01),
    ]);
    expect(m1.parentId).toBeNull();
    expect(c11.parentId).toBe(m1.id);
    expect(c12.parentId).toBe(m1.id);
    expect(c21.parentId).toBe(m2.id);
  });

  it("un componente sin su mueble en la hoja queda suelto", () => {
    const [suelto] = aComparables([parseado(5, 7.01)]);
    expect(suelto.parentId).toBeNull();
  });

  it("los ids salen de la fila del Excel y no se repiten", () => {
    const ids = aComparables([parseado(10, 1), parseado(11, 2)]).map((i) => i.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("calcularImpacto", () => {
  const antes = [existente("a1", 10, 1), existente("a2", 11, 2), existente("a3", 12, 3)];

  it("un Excel igual a la versión activa se reconoce como igual", () => {
    const despues = aComparables([parseado(10, 1), parseado(11, 2), parseado(12, 3)]);
    const impacto = calcularImpacto({ ...base, antes, despues, estados: sinTrabajo });
    expect(impacto.igual).toBe(true);
    expect(impacto.itemsNuevos).toBe(3);
    expect(impacto.cambios.mueblesSinCambios).toBe(3);
  });

  it("cuenta el trabajo en marcha de la versión activa", () => {
    const estados = new Map<string, EstadoItemEnMarcha>([
      ["a1", { liberado: true, asignaciones: 2, asignacionesConEntregas: 1, informes: 1 }],
      ["a2", { liberado: true, asignaciones: 0, asignacionesConEntregas: 0, informes: 0 }],
    ]);
    const despues = aComparables([parseado(10, 1), parseado(11, 2), parseado(12, 3)]);
    const { enMarcha } = calcularImpacto({ ...base, antes, despues, estados });
    expect(enMarcha).toEqual({
      itemsLiberados: 2,
      mueblesLiberados: 2,
      asignaciones: 2,
      asignacionesConEntregas: 1,
      itemsEvaluados: 1,
    });
    expect(necesitaConfirmacion(enMarcha)).toBe(true);
  });

  it("detecta los muebles liberados que cambian", () => {
    const estados = new Map([["a1", { liberado: true, asignaciones: 0, asignacionesConEntregas: 0, informes: 0 }]]);
    const despues = aComparables([parseado(10, 1, { cantidad_total: 25 }), parseado(11, 2), parseado(12, 3)]);
    const impacto = calcularImpacto({ ...base, antes, despues, estados });
    expect(impacto.igual).toBe(false);
    expect(impacto.cambios.mueblesModificados).toBe(1);
    expect(impacto.mueblesLiberadosQueCambian).toBe(1);
  });

  it("un mueble modificado que no estaba liberado no cuenta como liberado", () => {
    const despues = aComparables([parseado(10, 1, { cantidad_total: 25 }), parseado(11, 2), parseado(12, 3)]);
    const impacto = calcularImpacto({ ...base, antes, despues, estados: sinTrabajo });
    expect(impacto.mueblesLiberadosQueCambian).toBe(0);
    expect(impacto.cambios.mueblesModificados).toBe(1);
  });

  it("detecta los muebles quitados que estaban liberados y los que tenían asignaciones", () => {
    const estados = new Map<string, EstadoItemEnMarcha>([
      ["a3", { liberado: true, asignaciones: 1, asignacionesConEntregas: 0, informes: 0 }],
    ]);
    const despues = aComparables([parseado(10, 1), parseado(11, 2)]);
    const impacto = calcularImpacto({ ...base, antes, despues, estados });
    expect(impacto.cambios.mueblesQuitados).toBe(1);
    expect(impacto.mueblesLiberadosQuitados).toBe(1);
    expect(impacto.mueblesAsignadosQuitados).toBe(1);
  });

  it("agregar un mueble no toca lo liberado", () => {
    const estados = new Map([["a1", { liberado: true, asignaciones: 0, asignacionesConEntregas: 0, informes: 0 }]]);
    const despues = aComparables([parseado(10, 1), parseado(11, 2), parseado(12, 3), parseado(13, 4)]);
    const impacto = calcularImpacto({ ...base, antes, despues, estados });
    expect(impacto.cambios.mueblesAgregados).toBe(1);
    expect(impacto.mueblesLiberadosQueCambian).toBe(0);
    expect(impacto.mueblesLiberadosQuitados).toBe(0);
  });
});

describe("necesitaConfirmacion", () => {
  const vacio = { itemsLiberados: 0, mueblesLiberados: 0, asignaciones: 0, asignacionesConEntregas: 0, itemsEvaluados: 0 };

  it("sin trabajo en marcha no pide confirmar", () => {
    expect(necesitaConfirmacion(vacio)).toBe(false);
  });

  it("cualquiera de las tres señales basta", () => {
    expect(necesitaConfirmacion({ ...vacio, itemsLiberados: 1 })).toBe(true);
    expect(necesitaConfirmacion({ ...vacio, asignaciones: 1 })).toBe(true);
    expect(necesitaConfirmacion({ ...vacio, itemsEvaluados: 1 })).toBe(true);
  });
});

describe("describirCambios", () => {
  const resumen = {
    mueblesAgregados: 0,
    mueblesQuitados: 0,
    mueblesModificados: 0,
    mueblesSinCambios: 5,
    componentesAgregados: 0,
    componentesQuitados: 0,
    componentesModificados: 0,
    renumerados: 0,
  };

  it("sin diferencias dice que no hay cambios", () => {
    expect(describirCambios(resumen)).toBe("Sin cambios");
  });

  it("junta lo que cambió y concuerda en singular y plural", () => {
    expect(
      describirCambios({ ...resumen, mueblesModificados: 3, mueblesAgregados: 1, mueblesQuitados: 2, componentesModificados: 4, componentesAgregados: 1 })
    ).toBe("3 muebles modificados, 1 mueble agregado, 2 muebles quitados, 5 componentes con cambios");
    expect(describirCambios({ ...resumen, componentesQuitados: 1 })).toBe("1 componente con cambios");
  });
});
