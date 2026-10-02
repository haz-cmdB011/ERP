import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  armarReporte,
  claveContratista,
  etiquetaSemana,
  fechaLocal,
  rangoSemana,
  semanaDeFecha,
  semanaDePago,
  semanaPorReportar,
  semanasDelAnio,
  semanaVecina,
  type ReciboPagado,
} from "./reporte-semanal";
import { ENCABEZADOS_FORMATO, generarExcelFormato } from "./reporte-semanal-excel";

describe("semanas ISO", () => {
  it("calcula la semana de una fecha", () => {
    expect(semanaDeFecha("2026-09-14")).toEqual({ anio: 2026, semana: 38 });
    expect(semanaDeFecha("2026-09-20")).toEqual({ anio: 2026, semana: 38 });
    expect(semanaDeFecha("2026-09-21")).toEqual({ anio: 2026, semana: 39 });
  });

  it("coincide con las hojas del archivo de Descuentos IMSS", () => {
    // "Semana 01: del 29 de diciembre de 2025 al 04 de enero del 2026".
    expect(rangoSemana({ anio: 2026, semana: 1 })).toEqual({
      desde: "2025-12-29",
      hasta: "2026-01-04",
    });
    // "Semana 38: del 14 al 20 de septiembre del 2026".
    expect(rangoSemana({ anio: 2026, semana: 38 })).toEqual({
      desde: "2026-09-14",
      hasta: "2026-09-20",
    });
  });

  it("respeta el cambio de año ISO", () => {
    // 1 de enero de 2027 es viernes: pertenece a la semana 53 de 2026.
    expect(semanaDeFecha("2027-01-01")).toEqual({ anio: 2026, semana: 53 });
    expect(semanaDeFecha("2027-01-04")).toEqual({ anio: 2027, semana: 1 });
    expect(semanasDelAnio(2026)).toBe(53);
    expect(semanasDelAnio(2025)).toBe(52);
  });

  it("navega entre semanas cruzando el año", () => {
    expect(semanaVecina({ anio: 2026, semana: 53 }, 1)).toEqual({ anio: 2027, semana: 1 });
    expect(semanaVecina({ anio: 2027, semana: 1 }, -1)).toEqual({ anio: 2026, semana: 53 });
  });

  it("la semana N se paga en la N+1", () => {
    expect(semanaDePago({ anio: 2026, semana: 38 })).toEqual({ anio: 2026, semana: 39 });
    // La Semana 38 se envió el miércoles 23 de septiembre.
    expect(semanaPorReportar(new Date("2026-09-23T18:00:00Z"))).toEqual({
      anio: 2026,
      semana: 38,
    });
    expect(etiquetaSemana({ anio: 2026, semana: 38 })).toBe("SEMANA 038");
  });

  it("usa la hora de la Ciudad de México", () => {
    // Domingo 20 a las 23:30 en CDMX es lunes 21 en UTC.
    expect(fechaLocal("2026-09-21T05:30:00Z")).toBe("2026-09-20");
  });
});

const r = (p: Partial<ReciboPagado>): ReciboPagado => ({
  tipo: "acabados",
  folio: "1",
  contratista: "Juan",
  ot: "OT-1",
  obra: "",
  pagadoEn: "2026-09-22T18:00:00Z",
  importe: 0,
  piezas: 0,
  ...p,
});

// Semana 38 de 2026 tal como quedó en "FORMATO MAQUILA SEMANA 38".
const SEMANA_38: ReciboPagado[] = [
  r({ contratista: "CAYETANO MARQUEZ MONSALVO", folio: "2117", ot: "013-26", importe: 9200 }),
  r({ contratista: "CAYETANO MARQUEZ MONSALVO", folio: "2118", ot: "107-26", importe: 2000 }),
  r({ contratista: "CAYETANO MARQUEZ MONSALVO", folio: "2119", ot: "108-26", importe: 2000 }),
  r({ contratista: "CAYETANO MARQUEZ MONSALVO", folio: "2120", ot: "109-26", importe: 2000 }),
  r({ contratista: "CAYETANO MARQUEZ MONSALVO", folio: "2121", ot: "109-26", importe: 1400 }),
  r({ contratista: "CAYETANO MARQUEZ MONSALVO", folio: "2122", ot: "044-26", importe: 200 }),
  r({ contratista: "EMILIO HERNANDEZ GONZALEZ", tipo: "armado", folio: "274", ot: "168-25", importe: 450 }),
  r({ contratista: "EMILIO HERNANDEZ GONZALEZ", tipo: "armado", folio: "277", ot: "013-26", importe: 6600 }),
  r({ contratista: "EMILIO HERNANDEZ GONZALEZ", tipo: "armado", folio: "278", ot: "168-25", importe: 1000 }),
  r({ contratista: "EMILIO HERNANDEZ GONZALEZ", tipo: "armado", folio: "279", ot: "047-26", importe: 400 }),
  r({ contratista: "BRAYAN DANIEL BAZAN TELLEZ", tipo: "armado", folio: "229", ot: "168-25", importe: 700 }),
  r({ contratista: "BRAYAN DANIEL BAZAN TELLEZ", tipo: "armado", folio: "230", ot: "009-26", importe: 500 }),
  r({ contratista: "BRAYAN DANIEL BAZAN TELLEZ", tipo: "armado", folio: "231", ot: "013-26", importe: 6000 }),
  r({ contratista: "BRAYAN DANIEL BAZAN TELLEZ", tipo: "armado", folio: "232", ot: "118-26", importe: 1800 }),
  r({ contratista: "BRAYAN DANIEL BAZAN TELLEZ", tipo: "armado", folio: "233", ot: "117-26", importe: 1000 }),
  r({ contratista: "MARIA REYNA JIMENEZ NOLASCO", tipo: "armado", folio: "826", ot: "168-26", importe: 15000 }),
  r({ contratista: "MARIA REYNA JIMENEZ NOLASCO", tipo: "armado", folio: "828", ot: "168-25", importe: 4850 }),
  r({ contratista: "MARIA REYNA JIMENEZ NOLASCO", tipo: "armado", folio: "829", ot: "168-25", importe: 4900 }),
  r({ contratista: "MARIA REYNA JIMENEZ NOLASCO", tipo: "armado", folio: "830", ot: "168-25", importe: 6700 }),
  r({ contratista: "RAMIRO AMEL BARRIOS", tipo: "electrificacion", folio: "231", ot: "102-24", importe: 7186 }),
  r({ contratista: "RAMIRO AMEL BARRIOS", tipo: "electrificacion", folio: "232", ot: "168-25", importe: 5600 }),
  r({ contratista: "JUAN MANUEL TAPIA CALIXTO", tipo: "electrificacion", folio: "138", ot: "168-25", importe: 10500 }),
];

// SS de esa semana (Brayan con una semana acumulada: 892 × 2).
const SS_38 = new Map([
  [claveContratista("Cayetano Márquez Monsalvo"), 446],
  [claveContratista("EMILIO HERNANDEZ GONZALEZ"), 892],
  [claveContratista("BRAYAN DANIEL BAZAN TELLEZ"), 1784],
  [claveContratista("MARIA REYNA JIMENEZ NOLASCO"), 1593],
  [claveContratista("RAMIRO AMEL BARRIOS"), 892],
]);

describe("armarReporte", () => {
  it("suma las piezas trabajadas por folio y por maquilador", () => {
    const rep = armarReporte([
      r({ folio: "1", importe: 100, piezas: 12 }),
      r({ folio: "2", importe: 100, piezas: 3.5 }),
      r({ contratista: "Ana", folio: "3", importe: 100, piezas: 4 }),
    ]);
    const [ana, juan] = rep.grupos;
    expect(juan.filas.map((f) => f.piezas)).toEqual([12, 3.5]);
    expect(juan.piezas).toBe(15.5);
    expect(ana.piezas).toBe(4);
  });

  it("deja un renglón por folio, agrupado por maquilador", () => {
    const rep = armarReporte([
      r({ folio: "10", importe: 100 }),
      r({ folio: "2", importe: 50.5 }),
      r({ tipo: "electrificacion", folio: "2", importe: 30 }),
      r({ tipo: "armado", folio: "7", importe: 200 }),
      r({ contratista: "ana", ot: "", folio: "3", importe: 10 }),
      r({ contratista: "Ána ", folio: "4", importe: 5 }),
    ]);

    expect(rep.numRecibos).toBe(6);
    expect(rep.grupos.map((g) => g.contratista)).toEqual(["ana", "Juan"]);

    const [ana, juan] = rep.grupos;
    // Mayúsculas, acentos y espacios no separan al maquilador.
    expect(ana.filas.map((f) => f.folio)).toEqual(["3", "4"]);
    // Madera (Acabados/Armado) primero; folios en orden numérico.
    expect(juan.filas.map((f) => `${f.subcuenta} ${f.folio}`)).toEqual([
      "MQ MADERA 2",
      "MQ MADERA 7",
      "MQ MADERA 10",
      "MQ ELECTRICO 2",
    ]);
    expect(juan.importe).toBe(380.5);
    expect(juan.seguroSocial).toBeNull();
    expect(juan.totalPagar).toBe(380.5);
    expect(rep.seguroSocial).toBe(0);
    expect(rep.totalPagar).toBe(395.5);
  });

  it("reproduce los totales del FORMATO MAQUILA de la semana 38", () => {
    const rep = armarReporte(SEMANA_38, SS_38);
    expect(rep.numRecibos).toBe(22);
    expect(rep.importe).toBe(89986);
    expect(rep.seguroSocial).toBe(5607);
    expect(rep.totalPagar).toBe(84379);

    // El seguro va al folio de mayor importe del contratista.
    const folioConSS = (nombre: string) =>
      rep.grupos
        .find((g) => g.contratista === nombre)!
        .filas.filter((f) => f.seguroSocial != null)
        .map((f) => `${f.folio}:${f.seguroSocial}`);
    expect(folioConSS("CAYETANO MARQUEZ MONSALVO")).toEqual(["2117:446"]);
    expect(folioConSS("EMILIO HERNANDEZ GONZALEZ")).toEqual(["277:892"]);
    expect(folioConSS("BRAYAN DANIEL BAZAN TELLEZ")).toEqual(["231:1784"]);
    expect(folioConSS("MARIA REYNA JIMENEZ NOLASCO")).toEqual(["826:1593"]);
    expect(folioConSS("RAMIRO AMEL BARRIOS")).toEqual(["231:892"]);
    expect(folioConSS("JUAN MANUEL TAPIA CALIXTO")).toEqual([]);
  });

  it("si el seguro no cabe en un folio, pasa al siguiente sin dejar negativos", () => {
    const rep = armarReporte(
      [r({ folio: "1", importe: 300 }), r({ folio: "2", importe: 200 })],
      new Map([["JUAN", 446]])
    );
    const [juan] = rep.grupos;
    expect(juan.filas.map((f) => [f.folio, f.seguroSocial, f.totalPagar])).toEqual([
      ["1", 300, 0],
      ["2", 146, 54],
    ]);
    expect(juan.seguroSocial).toBe(446);
  });

  it("devuelve un reporte vacío sin recibos", () => {
    expect(armarReporte([])).toEqual({
      grupos: [],
      numRecibos: 0,
      importe: 0,
      seguroSocial: 0,
      totalPagar: 0,
    });
  });
});

describe("generarExcelFormato", () => {
  it("escribe las columnas del FORMATO MAQUILA", async () => {
    const rep = armarReporte(
      [
        r({ contratista: "RAMIRO AMEL BARRIOS", tipo: "electrificacion", folio: "231", ot: "102-24", obra: "LIV CANCUN", importe: 7186 }),
      ],
      new Map([["RAMIRO AMEL BARRIOS", 892]])
    );
    const buffer = await generarExcelFormato(rep, { anio: 2026, semana: 38 }, "23/09/2026");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe("SEMANA 038");
    expect(ws.getRow(1).values).toEqual([, "FECHA DE ENVIO", "23/09/2026"]);
    expect((ws.getRow(2).values as unknown[]).slice(1)).toEqual([...ENCABEZADOS_FORMATO]);
    expect((ws.getRow(3).values as unknown[]).slice(1)).toEqual([
      "RAMIRO AMEL BARRIOS",
      undefined,
      "05 MAQUILA",
      "MQ ELECTRICO",
      "SEMANA 038",
      "EST-231",
      undefined,
      "102-24 LIV CANCUN",
      7186,
      892,
      undefined,
      6294,
      231,
      "102-24",
    ]);
    expect(ws.getRow(4).getCell(12).value).toBe(6294);
  });
});
