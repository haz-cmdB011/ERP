import { describe, expect, it } from "vitest";
import {
  compararConCierre,
  instantaneaDeSemana,
  interpretarSemana,
  resumenFechasPago,
  resumirCompromiso,
  type ReciboPorPagar,
} from "./reporte-control";
import { semanaDeFecha, type ReciboPagado } from "./reporte-semanal";

function pagado(p: Partial<ReciboPagado>): ReciboPagado {
  return {
    tipo: "acabados",
    folio: "1",
    contratista: "Juan Pérez",
    ot: "193-24",
    obra: "",
    pagadoEn: "2026-09-23T18:00:00Z",
    importe: 1000,
    piezas: 10,
    ...p,
  };
}

const AHORA = new Date("2026-09-23T18:00:00Z"); // miércoles de la semana 39 → por reportar: 38

describe("interpretarSemana", () => {
  it("sin parámetros usa la semana por reportar sin avisar", () => {
    expect(interpretarSemana(undefined, undefined, AHORA)).toEqual({
      semana: { anio: 2026, semana: 38 },
      aviso: null,
    });
    expect(interpretarSemana("", " ", AHORA).aviso).toBeNull();
  });

  it("acepta una semana válida, incluida la 53 de un año largo", () => {
    expect(interpretarSemana("2026", "53", AHORA)).toEqual({
      semana: { anio: 2026, semana: 53 },
      aviso: null,
    });
  });

  it("avisa cuando la semana o el año no son válidos", () => {
    const sem = interpretarSemana("2026", "54", AHORA);
    expect(sem.semana).toEqual({ anio: 2026, semana: 38 });
    expect(sem.aviso).toContain("54");
    expect(interpretarSemana("2025", "53", AHORA).aviso).toContain("tiene 52");
    expect(interpretarSemana("abc", "3", AHORA).aviso).toContain("año");
    expect(interpretarSemana("1999", "3", AHORA).aviso).not.toBeNull();
    expect(interpretarSemana("2026", "2.5", AHORA).aviso).not.toBeNull();
    // Falta el año pero hay semana: tampoco se adivina.
    expect(interpretarSemana(undefined, "3", AHORA).aviso).not.toBeNull();
  });
});

describe("resumenFechasPago", () => {
  it("agrupa por día local, no por día UTC", () => {
    // 03:00 UTC del martes es todavía lunes 21:00 en la Ciudad de México.
    const r = resumenFechasPago([
      pagado({ folio: "1", pagadoEn: "2026-09-22T03:00:00Z", importe: 100 }),
      pagado({ folio: "2", pagadoEn: "2026-09-21T20:00:00Z", importe: 50.5 }),
      pagado({ folio: "3", pagadoEn: "2026-09-25T18:00:00Z", importe: 10 }),
    ]);
    expect(r).toEqual([
      { fecha: "2026-09-21", recibos: 2, importe: 150.5 },
      { fecha: "2026-09-25", recibos: 1, importe: 10 },
    ]);
  });

  it("sin recibos no devuelve fechas", () => {
    expect(resumenFechasPago([])).toEqual([]);
  });

  it("el límite del lunes a las 00:00 local cae en la semana nueva", () => {
    // Lunes 21 de septiembre 00:00 en CDMX (UTC-6) = 06:00 UTC.
    expect(semanaDeFecha(resumenFechasPago([pagado({ pagadoEn: "2026-09-21T06:00:00Z" })])[0].fecha)).toEqual({
      anio: 2026,
      semana: 39,
    });
    // Un minuto antes sigue siendo domingo, semana 38.
    expect(semanaDeFecha(resumenFechasPago([pagado({ pagadoEn: "2026-09-21T05:59:00Z" })])[0].fecha)).toEqual({
      anio: 2026,
      semana: 38,
    });
  });
});

describe("resumirCompromiso", () => {
  const porPagar = (p: Partial<ReciboPorPagar>): ReciboPorPagar => ({
    tipo: "electrificacion",
    folio: "10",
    contratista: "Ana",
    revisadoEn: "2026-09-20T18:00:00Z",
    importe: 800,
    ...p,
  });

  it("suma por área y encuentra el más antiguo y los atrasados", () => {
    const c = resumirCompromiso(
      [
        porPagar({ folio: "10", revisadoEn: "2026-09-10T18:00:00Z", importe: 800 }),
        porPagar({ folio: "11", revisadoEn: "2026-09-22T18:00:00Z", importe: 200.25 }),
        porPagar({ tipo: "armado", folio: "5", revisadoEn: "2026-09-21T18:00:00Z", importe: 100 }),
      ],
      AHORA
    );
    expect(c.numRecibos).toBe(3);
    expect(c.importe).toBe(1100.25);
    expect(c.porArea.map((a) => a.tipo)).toEqual(["armado", "electrificacion"]);
    expect(c.masAntiguo).toMatchObject({ folio: "10", dias: 13 });
    expect(c.atrasados).toBe(1);
  });

  it("tolera recibos revisados sin fecha y la lista vacía", () => {
    const c = resumirCompromiso([porPagar({ revisadoEn: null })], AHORA);
    expect(c.numRecibos).toBe(1);
    expect(c.masAntiguo).toBeNull();
    expect(resumirCompromiso([], AHORA)).toMatchObject({ numRecibos: 0, importe: 0, masAntiguo: null });
  });
});

describe("cierre de semana", () => {
  const base = [
    pagado({ folio: "2", importe: 300 }),
    pagado({ folio: "1", importe: 700 }),
    pagado({ tipo: "electrificacion", folio: "1", importe: 50 }),
  ];

  it("la instantánea es estable y suma el importe", () => {
    const i = instantaneaDeSemana(base);
    expect(i.numRecibos).toBe(3);
    expect(i.importe).toBe(1050);
    expect(i.recibos.map((r) => `${r.tipo}:${r.folio}`)).toEqual([
      "acabados:1",
      "acabados:2",
      "electrificacion:1",
    ]);
    expect(instantaneaDeSemana([...base].reverse())).toEqual(i);
  });

  it("sin cambios no hay diferencias", () => {
    const i = instantaneaDeSemana(base);
    expect(compararConCierre(i, instantaneaDeSemana(base)).sinCambios).toBe(true);
  });

  it("detecta recibos eliminados, nuevos y con otro importe", () => {
    const cerrado = instantaneaDeSemana(base);
    const hoy = instantaneaDeSemana([
      pagado({ folio: "1", importe: 650 }), // cambió
      pagado({ tipo: "electrificacion", folio: "1", importe: 50 }), // igual
      pagado({ folio: "9", importe: 20 }), // nuevo (y falta el folio 2)
    ]);
    const d = compararConCierre(cerrado, hoy);
    expect(d.sinCambios).toBe(false);
    expect(d.faltantes.map((r) => r.folio)).toEqual(["2"]);
    expect(d.agregados.map((r) => r.folio)).toEqual(["9"]);
    expect(d.cambiados).toHaveLength(1);
    expect(d.cambiados[0]).toMatchObject({ importeCerrado: 700 });
    expect(d.difImporte).toBe(-330);
    expect(d.difRecibos).toBe(0);
  });

  it("el mismo folio en otra área no se confunde", () => {
    const cerrado = instantaneaDeSemana([pagado({ tipo: "acabados", folio: "1" })]);
    const hoy = instantaneaDeSemana([pagado({ tipo: "armado", folio: "1" })]);
    const d = compararConCierre(cerrado, hoy);
    expect(d.faltantes).toHaveLength(1);
    expect(d.agregados).toHaveLength(1);
  });
});
