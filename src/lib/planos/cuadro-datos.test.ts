import { describe, expect, it } from "vitest";
import { extraerAcabados, extraerEspecificaciones, type TextoPdf } from "./cuadro-datos";

// Coordenadas reales (x, y en puntos PDF) de los cuadros de datos de
// planos del servidor de Ingeniería, una por plantilla.
function t(lista: [number, number, string][]): TextoPdf[] {
  return lista.map(([x, y, texto]) => ({ x, y, texto }));
}

// Plantilla 2022 (SC-111-01): valores DEBAJO de la etiqueta; el de
// ESPECIFICACIÓN queda 2 pt arriba del de PROYECTO.
const PLANTILLA_2022 = t([
  [202, 98, "BOTON BALANCIN PARA ACCIONAR"],
  [29, 57, "SC-111-01 FUNCION A"],
  [507, 37, "ARMADOR:"], [573, 37, "OT:"], [584, 37, "024/22"], [664, 37, "ESPECIFICACIÓN:"],
  [435, 35, "NOMENCLATURA DE ACABADOS:"], [742, 35, "UNIDADES:"], [770, 35, "mm"],
  [319, 33, "INGENIERIA Y DISEÑO"], [663, 33, "ISOMETRICO"], [573, 31, "PROYECTO:"],
  [433, 27, "MADERA: LP-XX"], [573, 27, "VITRINAS RELOJES LIV ZAPOPAN"], [691, 27, "NOMBRE"], [717, 27, "FECHA"],
  [743, 23, "ESCALA: 1:20"], [507, 22, "SUPERVISOR DE ARMADO:"],
  [310, 21, "ESTE DIBUJO ES PROPIEDAD DE IDEAS MOBILIARIUM S.A. DE C.V."],
  [573, 20, "DESCRIPCIÓN:"], [664, 20, "DIBUJO"], [690, 19, "G.C.R"], [714, 19, "07/03/2022"],
  [573, 13, "SC-111-01"], [665, 13, "VERIFICO"], [693, 13, "F.J.M.C"], [742, 13, "HOJA 1"], [762, 13, "DE 26"],
  [8, 7, "RUTA: I:\\INGENIERIA\\O. T´s. 2022\\"],
]);

// Plantilla 2023+ (GID-537-B): valores A LA DERECHA; DIBUJO queda 2 pt
// abajo de DESCRIPCIÓN y no debe dejar pasar el nombre del dibujante.
const PLANTILLA_2023 = t([
  [629, 113, "ACABADO: MT-A"],
  [465, 62, "ARMADOR:"], [514, 62, "PM:"], [531, 62, "SEGUN PEDIDO"], [578, 62, "ESPECIFICACIÓN:"], [637, 62, "ISOMETRICO"],
  [514, 52, "PROYECTO:"], [275, 51, "INGENIERIA Y DISEÑO"], [609, 48, "NOMBRE"], [701, 48, "1."], [708, 48, "---"],
  [514, 44, "SEGUN PEDIDO"], [741, 36, "ESCALA: 1:5"], [512, 35, "DESCRIPCIÓN:"], [608, 34, "RUBEN B."],
  [578, 33, "DIBUJO"], [664, 33, "FECHA"], [464, 26, "ARMADO:"], [511, 26, "GID-537-B"],
  [577, 23, "VERIFICO"], [608, 23, "ANTONIO S. _"], [512, 20, "-"], [663, 20, "15-12-23"],
  [739, 20, "HOJA 1"], [739, 14, "DE 9"],
]);

// ZOCLO: especificación en la misma cadena que su etiqueta y notas a la
// izquierda del cuadro, a su misma altura.
const ZOCLO = t([
  [700, 330, "ACABADO PT-191"],
  [30, 60, "FABRICAR 23 PZ"], [30, 48, "TOTAL DE METROS LINEALES"],
  [360, 55, "INGENIERIA Y DISEÑO"], [600, 62, "NOMENCLATURA"],
  [800, 62, "PM: SEGUN PEDIDO"], [900, 62, "ESPECIFICACIÓN: ZOCLO 6 MM"],
  [800, 45, "DESCRIPCIÓN:"], [800, 36, "ZOCLO"], [900, 45, "DIBUJO"], [950, 45, "GERARDO C."], [1035, 45, "05/11/2022"],
  [1100, 45, "ESCALA: 1:33.3"],
]);

describe("extraerEspecificaciones", () => {
  it("plantilla con valores debajo de la etiqueta", () => {
    const r = extraerEspecificaciones(PLANTILLA_2022, "");
    expect(r).toMatchObject({
      especificacion: "ISOMETRICO",
      descripcion: "SC-111-01",
      proyecto: "VITRINAS RELOJES LIV ZAPOPAN",
      pm_plano: "024/22",
      dibujo: "G.C.R",
      verifico: "F.J.M.C",
      fecha_plano: "07/03/2022",
      escala: "1:20",
    });
    expect(r.notas).toContain("BOTON BALANCIN PARA ACCIONAR");
    expect(r.notas.join(" ")).not.toMatch(/RUTA|NOMBRE/);
  });

  it("plantilla con valores a la derecha", () => {
    expect(extraerEspecificaciones(PLANTILLA_2023, "")).toMatchObject({
      especificacion: "ISOMETRICO",
      descripcion: "GID-537-B",
      proyecto: "SEGUN PEDIDO",
      pm_plano: "SEGUN PEDIDO",
      dibujo: "RUBEN B.",
      verifico: "ANTONIO S.",
      fecha_plano: "15-12-23",
      escala: "1:5",
      notas: ["ACABADO: MT-A"],
    });
  });

  it("valor en la misma cadena y notas a la izquierda del cuadro", () => {
    const r = extraerEspecificaciones(ZOCLO, "ACABADO PT-191");
    expect(r).toMatchObject({
      especificacion: "ZOCLO 6 MM",
      descripcion: "ZOCLO",
      pm_plano: "SEGUN PEDIDO",
      dibujo: "GERARDO C.",
      fecha_plano: "05/11/2022",
      acabados: ["PT-191"],
    });
    expect(r.notas).toEqual(["ACABADO PT-191", "FABRICAR 23 PZ", "TOTAL DE METROS LINEALES"]);
  });
});

describe("extraerAcabados", () => {
  it("toma los códigos de nomenclatura sin los XX de la leyenda", () => {
    expect(extraerAcabados("MADERA: LP-XX ACABADO LP-A, ACAB. MT-72 y CR-A; META: MT-XX lp-a")).toEqual([
      "CR-A",
      "LP-A",
      "MT-72",
    ]);
  });
});
