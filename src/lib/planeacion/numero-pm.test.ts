import { describe, expect, it } from "vitest";
import { avisoNumeroPM, normalizarNumeroPM, ordenDeTrabajo, pmDeHojaRepetida, pmsDeLasHojas } from "./numero-pm";

describe("normalizarNumeroPM", () => {
  it.each([
    ["PM 107-26", "PM107-26"],
    ["PM107-26", "PM107-26"],
    ["pm-107-26", "PM107-26"],
    ["PM 107 - 26", "PM107-26"],
    ["107-26", "PM107-26"],
    ["PM 9-26", "PM009-26"],
    ["PM 107/2026", "PM107-26"],
    ["PM 1234-26", "PM1234-26"],
  ])("normaliza %s → %s", (entrada, esperado) => {
    expect(normalizarNumeroPM(entrada)).toBe(esperado);
  });

  it("toma el año del nombre del archivo si la celda no lo trae", () => {
    expect(
      normalizarNumeroPM("PM 107", { nombreArchivo: "PM 107-26 SMART FIT PLAZA PALMIRA.xlsx" })
    ).toBe("PM107-26");
  });

  it("ignora el nombre del archivo si es de otro PM", () => {
    expect(
      normalizarNumeroPM("PM 108", {
        nombreArchivo: "PM 107-26 SMART FIT.xlsx",
        fechaPedido: "2025-03-01",
      })
    ).toBe("PM108-25");
  });

  it("usa el año de la fecha del pedido como respaldo", () => {
    expect(normalizarNumeroPM("PM-999", { fechaPedido: "2026-02-06" })).toBe("PM999-26");
  });

  it("usa el año actual si no hay otra fuente", () => {
    expect(normalizarNumeroPM("PM-999", { hoy: new Date(2027, 0, 1) })).toBe("PM999-27");
  });

  it("deja el valor intacto si no trae ningún número", () => {
    expect(normalizarNumeroPM("SIN NUMERO")).toBe("SIN NUMERO");
  });

  describe("varios PM en una Orden de Trabajo", () => {
    it.each([
      ["1PM134-26", "1PM134-26"],
      ["2 PM 134-26", "2PM134-26"],
      ["02-PM-134/2026", "2PM134-26"],
      ["3pm 9-26", "3PM009-26"],
    ])("conserva el número de PM: %s → %s", (entrada, esperado) => {
      expect(normalizarNumeroPM(entrada)).toBe(esperado);
    });

    // El "-2" es parte del código de la OT (todas las carpetas de 2026 lo
    // llevan: "115-26-2 CORNER JBE LIV CHIHUAHUA"), no el número de PM.
    it.each([
      ["102-24-2", "PM102-24"],
      ["PM 102-24-2", "PM102-24"],
      ["009-26-2", "PM009-26"],
      ["OT 120-26-2", "PM120-26"],
    ])("el sufijo de la OT no es número de PM: %s → %s", (entrada, esperado) => {
      expect(normalizarNumeroPM(entrada)).toBe(esperado);
    });

    it("toma el número de PM del nombre del archivo si la celda no lo trae", () => {
      expect(
        normalizarNumeroPM("PM134-26", { nombreArchivo: "2PM 134-26 SMART FIT.xlsx" })
      ).toBe("2PM134-26");
    });

    it("tampoco toma el sufijo del nombre del archivo", () => {
      expect(
        normalizarNumeroPM("PM102-24", { nombreArchivo: "PM 102-24-2 REMODELACION CAMPESTRE II.xlsx" })
      ).toBe("PM102-24");
    });

    it("no confunde una fecha del nombre del archivo con el número de PM", () => {
      expect(
        normalizarNumeroPM("168-25 REMODELACIÓN PH MONTERREY REPROCESOS", {
          nombreArchivo: "PM 168-25 REMODELACIÓN PH MONTERREY REPROCESOS 8.07.26.xlsx",
        })
      ).toBe("PM168-25");
    });

    describe("OT cuyo nombre lleva sufijo (193-24-2 PH MONTERREY)", () => {
      // Celda "No. PEDIDO" y nombre de archivo reales de la carpeta
      // P:\2024\193-24-2 PH MONTERREY\PEDIDO: el "-2" de la celda es de la OT
      // y se repite en todos los PM; el número de PM va en el nombre.
      it.each([
        ["193-24-2-SDC 6, 8, 9", "7 PM 193-24 - PH MONTERREY SDC 6 8 9 - 13.05.25.xlsx", "7PM193-24"],
        ["193-24-2-SDC2", "8 PM 193-24 - PH MONTERREY SDC 10 - 19.05.25.xlsx", "8PM193-24"],
        ["193-24 SDC 11", "10 PM 193-24 - PH MONTERREY SDC 11 29.05.25.xlsx", "10PM193-24"],
        ["193-24-2 SDC12 PH MONTERREY", "11 PM 193-24 - PH MONTERREY P.B. SDC 12 17.07.25.xlsx", "11PM193-24"],
        ["193-24", "12 PM 193-24 - PH MONTERREY 24.06.25.xlsx", "12PM193-24"],
        ["193-24", "13 PM 193-24 - PH MONTERREY 04.07.25.xlsx", "13PM193-24"],
        ["193-24-2-SDC2", "14 PM 193-24 - PH MONTERREY SDC 15 18.07.25.xlsx", "14PM193-24"],
        ["193-24-2-SDC2", "15 PM 193-24 - PH MONTERREY 21.07.25.xlsx", "15PM193-24"],
        ["193-24-2 SDC16", "16 PM 193-24 - PH MONTERREY SDC 16 07.08.25 modif.xlsx", "16PM193-24"],
        ["193-24-2 SDC17 PH MONTERREY", "17 PM 193-24 - PH MONTERREY AZ SDC 17 - 13.10.25.xlsx", "17PM193-24"],
      ])("celda %s + archivo %s → %s", (celda, archivo, esperado) => {
        expect(normalizarNumeroPM(celda, { nombreArchivo: archivo })).toBe(esperado);
      });

      it("sin proyecto ni número explícito queda solo la OT", () => {
        expect(
          normalizarNumeroPM("193-24-2 SDC 5", {
            nombreArchivo: "PM 193-24 - PH MONTERREY SDC 5 - 30.04.25.xlsx",
          })
        ).toBe("PM193-24");
      });

      // Los PM sin número se distinguen por el nombre del archivo; sus
      // versiones anteriores (carpeta "anterior") caen en el mismo PM.
      it.each([
        ["193-24", "SOTANO-PH MONTERREY", "PM 193-24 - PH MONTERREY SOTANO 1 10.1.25_.xlsx", "PM193-24 SOTANO 1"],
        ["193-24", "SOTANO-PH MONTERREY", "PM 193-24 - PH MONTERREY SOTANO 1 20.12.24_vrev.xlsx", "PM193-24 SOTANO 1"],
        ["193-24", "SOTANO-PH MONTERREY", "erick de PM 193-24 - PH MONTERREY SOTANO 1 20.12.24. MODIF.xlsx", "PM193-24 SOTANO 1"],
        ["193-24", "SOTANO  - PH MONTERREY", "PM 193-24 - PH MONTERREY SOTANO 3 14.02.25.xlsx", "PM193-24 SOTANO 3"],
        ["193-24", "SOTANO  - PH MONTERREY", "PM 193-24 - PH MONTERREY SOTANO 4 15.04.25.xlsx", "PM193-24 SOTANO 4"],
        ["193-24", "PB, PN, SN Y AZOTEA  - PH MONTERREY", "PM 193-24 - PH MONTERREY PB-PN-SN- AZ- 2 31.01.25.xlsx", "PM193-24 PB PN SN AZ 2"],
        ["193-24-2-SDC2, 3 Y 4", "SDC2, SDC, 3, SDC3 - PH MONTERREY", "PM 193-24 - PH MONTERREY SDC 2, 3 Y 4 - 25.04.25.xlsx", "PM193-24 SDC 2 3 Y 4"],
        ["193-24-2-SDC2, 3 Y 4", "SDC2, SDC, 3, SDC3 - PH MONTERREY", "erick  PM 193-24 - PH MONTERREY SDC 2 3 Y 4 - 22.04.25 (002).xlsx", "PM193-24 SDC 2 3 Y 4"],
        ["193-24-2 SDC 5", "SDC 5 - PH MONTERREY", "PM 193-24 - PH MONTERREY SDC 5 - 30.04.25.xlsx", "PM193-24 SDC 5"],
      ])("celda %s, proyecto %s, archivo %s → %s", (celda, proyecto, archivo, esperado) => {
        expect(normalizarNumeroPM(celda, { nombreArchivo: archivo, proyecto })).toBe(esperado);
      });

      it.each([
        "ERICK 11 PM 193-24 - PH MONTERREY PLANTA BAJA SDC 12 17.07.25.xlsx",
        "anterior 11 PM 193-24 - PH MONTERREY PLANTA BAJA SDC 12 18.06.25.xlsx",
      ])("reconoce el número de PM después de otra palabra: %s", (archivo) => {
        expect(
          normalizarNumeroPM("193-24-2 SDC12 PH MONTERREY", {
            nombreArchivo: archivo,
            proyecto: "PLANTA BAJA  - PH MONTERREY",
          })
        ).toBe("11PM193-24");
      });

      it("con número en el nombre del archivo no agrega etiqueta", () => {
        expect(
          normalizarNumeroPM("193-24-2 SDC17 PH MONTERREY", {
            nombreArchivo: "17 PM 193-24 - PH MONTERREY AZ SDC 17 - 13.10.25.xlsx",
            proyecto: "PH MONTERREY",
          })
        ).toBe("17PM193-24");
      });

      // P:\2026\013-26-2 HERRERIAS Y CARPINTERIAS PREFIRTS EMA\PEDIDO: la
      // celda dice "013-26-2" en todos los salones; los distingue el salón.
      it.each([
        ["HERRERIAS Y CARPINTERIAS PREFIRST EMA SALON 03", "PM_013-26 HERRERIAS Y CARPINTERIAS PREFIRST EMA SALON 03 17.08.26.xlsx", "PM013-26 SALON 3"],
        ["HERRERIAS Y CARPINTERIAS PREFIRST EMA SALON 04", "PM_013-26 HERRERIAS Y CARPINTERIAS PREFIRST EMA SALON 04 17.08.26.xlsx", "PM013-26 SALON 4"],
        ["HERRERIAS Y CARPINTERIAS PREFIRS EMA", "PM_013-26 HERRERIAS Y CARPINTERIAS PREFIRST EMA SALON 02 V22.07.26.xlsx", "PM013-26 SALON 2"],
      ])("salones de la OT 013-26: proyecto %s, archivo %s → %s", (proyecto, archivo, esperado) => {
        const opciones = { nombreArchivo: archivo, proyecto, fechaPedido: "2026-08-06" };
        expect(normalizarNumeroPM("013-26-2", opciones)).toBe(esperado);
        expect(avisoNumeroPM("013-26-2", esperado, opciones)).toBeNull();
      });

      // Corners JBE de Liverpool: "E3" al inicio del archivo es la etapa (la
      // columna ETAPA dice "ETAPA 3"); unas celdas traen el "-2" y otras no.
      it.each([
        ["115-26-2", "CORNER JBE LIV CHIHUAHUA", "E3 OT 115-26 CORNER JBE LIV CHIHUAHUA 04.09.26.xlsx", "PM115-26 ETAPA 3"],
        ["116-26", "OT 116-26 CORNER JBE LIV CHETUMAL", "E5 OT 116-26 CORNER JBE LIV CHETUMAL 04.09.26.xlsx", "PM116-26 ETAPA 5"],
        ["OT 120-26-2", "CORNER JBE LIV MOCAMBO", "E3 OT 120-26 CORNER JBE LIV MOCAMBO 04.09.26.xlsx", "PM120-26 ETAPA 3"],
        ["OT 126-26-2", "ANN TAYLOR FASE 2 LIV. INSURGENTES", "PM 126-26-2_ETAPA 2_ANN TAYLOR LIV. INSURGENTES.xlsx", "PM126-26 ETAPA 2"],
        ["OT 127-26-2", "ETAPA 2 ANN TAYLOR LIV. POLANCO", "PM 127-26-2_ETAPA 2_ANN TAYLOR LIV. POLANCO.xlsx", "PM127-26 ETAPA 2"],
        ["075-26", "SALON H-203 TEATRO MEDITERRANEO EMA", "PM 075-26 SALON H-203 TEATRO MEDITERRANEO EMA TAPAS REGISTRO.xlsx", "PM075-26 TAPAS REGISTRO"],
        ["114-26-2", "PLAFON DECORATIVO ACCESOS CC PERISUR", "PM OT 114-26 PLAFON DECORATIVO ACCESOS CC PERISUR.xlsx", "PM114-26"],
      ])("celda %s, proyecto %s, archivo %s → %s", (celda, proyecto, archivo, esperado) => {
        const opciones = { nombreArchivo: archivo, proyecto };
        expect(normalizarNumeroPM(celda, opciones)).toBe(esperado);
        expect(avisoNumeroPM(celda, esperado, opciones)).toBeNull();
      });

      it("la etapa de un archivo de otra OT no cuenta", () => {
        expect(
          normalizarNumeroPM("115-26", { nombreArchivo: "E3 OT 116-26 CORNER JBE.xlsx", proyecto: "CORNER JBE" })
        ).toBe("PM115-26");
      });

      it("un proyecto que es solo «<PALABRA> <NÚMERO>» no agrega etiqueta", () => {
        expect(
          normalizarNumeroPM("050-25", { nombreArchivo: "PM 050-25 TORRE 2.xlsx", proyecto: "TORRE 2" })
        ).toBe("PM050-25");
      });

      it("la etiqueta sigue en la misma OT", () => {
        expect(ordenDeTrabajo("PM193-24 SOTANO 1")).toBe("193-24");
      });

      it("el número explícito de la celda sigue mandando sobre el del archivo", () => {
        expect(
          normalizarNumeroPM("3PM134-26", { nombreArchivo: "2PM 134-26 SMART FIT.xlsx" })
        ).toBe("3PM134-26");
      });
    });

    describe("OT con un solo PM", () => {
      it.each([
        ["PM 107-26", "SMART FIT PLAZA PALMIRA", "PM 107-26 SMART FIT PLAZA PALMIRA.xlsx"],
        ["PM 107-26", "SMART FIT PLAZA PALMIRA", "PM 107-26 - SMART FIT PLAZA PALMIRA 10.02.26 MODIF.xlsx"],
        ["PM 107-26", "SMART FIT PLAZA PALMIRA", "PM 107-26.xlsx"],
        ["PM 107-26", "SMART FIT PLAZA PALMIRA", "PM 107-26 REV.xlsx"],
      ])("sin texto propio en el archivo queda igual: %s / %s / %s", (celda, proyecto, archivo) => {
        expect(normalizarNumeroPM(celda, { nombreArchivo: archivo, proyecto })).toBe("PM107-26");
      });
    });

    it("ignora el número de PM del archivo si es de otra OT", () => {
      expect(
        normalizarNumeroPM("PM135-26", { nombreArchivo: "2PM 134-26 SMART FIT.xlsx" })
      ).toBe("PM135-26");
    });

    describe("hojas extra con etiqueta (ej. solicitud de cambio)", () => {
      it.each([
        ["SDC-1_OT 009-26-2", "SDC-1 PM009-26"],
        ["SDC-1 OT 009-26-2", "SDC-1 PM009-26"],
        ["SDC-02_OT 027-26", "SDC-2 PM027-26"],
        ["sdc 2_OT. 009-26", "SDC-2 PM009-26"],
        ["SDC-1 PM 134-26", "SDC-1 PM134-26"],
        ["SDC-1_2PM134-26", "SDC-1 2PM134-26"],
      ])("conserva la etiqueta: %s → %s", (entrada, esperado) => {
        expect(normalizarNumeroPM(entrada)).toBe(esperado);
      });

      it("no toma el número de OT como etiqueta", () => {
        expect(normalizarNumeroPM("OT 009-26-2")).toBe("PM009-26");
      });

      it("queda en la misma OT que el PM principal", () => {
        expect(ordenDeTrabajo(normalizarNumeroPM("SDC-1_OT 009-26-2"))).toBe("009-26");
      });
    });

    it.each([
      ["PM134-26", "134-26"],
      ["1PM134-26", "134-26"],
      ["2PM134-26", "134-26"],
      ["009-26-2", null],
    ])("orden de trabajo de %s → %s", (pm, ot) => {
      expect(ordenDeTrabajo(pm)).toBe(ot);
    });
  });
});

describe("avisoNumeroPM", () => {
  it("avisa cuando la celda y el archivo dan PM distintos", () => {
    const nombreArchivo = "17 PM 193-24 - PH MONTERREY AZ SDC 17 - 13.10.25.xlsx";
    const celda = "16 PM 193-24";
    const pm = normalizarNumeroPM(celda, { nombreArchivo });
    expect(pm).toBe("16PM193-24");
    expect(avisoNumeroPM(celda, pm, { nombreArchivo })).toBe(
      'La celda "No. PEDIDO" dice «16 PM 193-24» (16PM193-24), pero el nombre del archivo indica 17PM193-24; se cargó como 16PM193-24.'
    );
  });

  it("no avisa si coinciden o si la celda no trae número de PM", () => {
    const opciones = { nombreArchivo: "12 PM 193-24 - PH MONTERREY 24.06.25.xlsx" };
    expect(avisoNumeroPM("193-24", "12PM193-24", opciones)).toBeNull();
    expect(avisoNumeroPM("2PM134-26", "2PM134-26", { nombreArchivo: "2PM 134-26.xlsx" })).toBeNull();
    expect(avisoNumeroPM("193-24-2", "2PM193-24", {})).toBeNull();
  });
});

describe("pmsDeLasHojas", () => {
  it("las hojas que repiten el No. PEDIDO toman el título de la primera", () => {
    const opciones = { fechaPedido: "2026-07-09", proyecto: "HERRERIAS Y CARPINTERIAS PREFIRS EMA" };
    const pms = pmsDeLasHojas([
      {
        nombreHoja: "PEDIDO",
        numeroPedido: "013-26-2",
        opciones: { ...opciones, nombreArchivo: "PM_013-26 HERRERIAS Y CARPINTERIAS PREFIRST EMA SALON 02 V22.07.26.xlsx" },
      },
      { nombreHoja: "incidencias", numeroPedido: "013-26-2", opciones },
      { nombreHoja: "X FECHAS", numeroPedido: "013-26-2", opciones },
    ]).map((r) => r.pm);
    expect(pms).toEqual(["PM013-26 SALON 2", "PM013-26 SALON 2 INCIDENCIAS", "PM013-26 SALON 2 X FECHAS"]);
  });

  it("si la primera hoja tiene nombre propio también lo lleva (ETAPA 1 / ETAPA 2)", () => {
    const opciones = { fechaPedido: "2026-08-18", proyecto: "PLAFON DECORATIVO ACCESOS CC PERISUR" };
    const r = pmsDeLasHojas([
      {
        nombreHoja: "ETAPA 1",
        numeroPedido: "114-26-2",
        opciones: { ...opciones, nombreArchivo: "PM OT 114-26 PLAFON DECORATIVO ACCESOS CC PERISUR.xlsx" },
      },
      { nombreHoja: "ETAPA 2", numeroPedido: "114-26-2", opciones },
    ]);
    expect(r.map((x) => x.pm)).toEqual(["PM114-26 ETAPA 1", "PM114-26 ETAPA 2"]);
    expect(r[1].aviso).toContain("(PM114-26 ETAPA 1)");
  });

  it("hojas con distinto No. PEDIDO quedan como PM distintos", () => {
    const pms = pmsDeLasHojas([
      { nombreHoja: "PEDIDO", numeroPedido: "PM 009-26", opciones: {} },
      { nombreHoja: "SDC-1", numeroPedido: "SDC-1_OT 009-26-2", opciones: {} },
    ]).map((r) => r.pm);
    expect(pms).toEqual(["PM009-26", "SDC-1 PM009-26"]);
  });

  it("conserva el caso PEDIDO (2) del 102-24-2", () => {
    const pms = pmsDeLasHojas([
      { nombreHoja: "PEDIDO", numeroPedido: "102-24-2", opciones: {} },
      { nombreHoja: "PEDIDO (2)", numeroPedido: "102-24-2", opciones: {} },
    ]).map((r) => r.pm);
    expect(pms).toEqual(["PM102-24", "PM102-24 PEDIDO (2)"]);
  });
});

describe("pmDeHojaRepetida", () => {
  it("distingue con el nombre de la hoja y sigue en la misma OT", () => {
    const pm = pmDeHojaRepetida("2PM102-24", " PEDIDO  (2) ");
    expect(pm).toBe("2PM102-24 PEDIDO (2)");
    expect(ordenDeTrabajo(pm)).toBe("102-24");
  });
});
