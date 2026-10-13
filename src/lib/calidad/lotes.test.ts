import { describe, expect, it } from "vitest";
import { estadoMueble, leerPiezas, lotesPorEvaluar, resumirLotes, validarEvaluacion } from "./lotes";
import { estadoDe, idsPorAprobar } from "./estado-item";

const lote = (extra: object = {}) => ({
  cantidad: 5,
  aprobadas: 0,
  rechazadas: 0,
  pendiente: 5,
  informe_rechazo_id: null as string | null,
  ...extra,
});

describe("resumirLotes y estadoMueble", () => {
  it("sin lotes el mueble sigue en producción", () => {
    expect(estadoMueble(resumirLotes([]))).toBe("en_produccion");
  });

  it("con piezas por evaluar, le toca a Calidad", () => {
    const r = resumirLotes([lote(), lote({ aprobadas: 5, pendiente: 0 })]);
    expect(r).toMatchObject({ verificadas: 10, aprobadas: 5, porEvaluar: 5, enRetrabajo: 0 });
    expect(estadoMueble(r)).toBe("por_evaluar");
  });

  it("un lote mixto deja piezas en retrabajo hasta que el retrabajo pasa por Calidad", () => {
    // 4 aprobadas y 1 rechazada; el retrabajo todavía no regresa.
    const mixto = lote({ aprobadas: 4, rechazadas: 1, pendiente: 0 });
    expect(estadoMueble(resumirLotes([mixto]))).toBe("en_retrabajo");
    // El retrabajo (1 pieza) regresa y Calidad lo aprueba.
    const retrabajo = lote({ cantidad: 1, aprobadas: 1, pendiente: 0, informe_rechazo_id: "inf-1" });
    const r = resumirLotes([mixto, retrabajo]);
    expect(r).toMatchObject({ aprobadas: 5, rechazadas: 1, enRetrabajo: 0 });
    expect(estadoMueble(r)).toBe("aprobado");
  });

  it("si el retrabajo se vuelve a rechazar, la pieza sigue en retrabajo", () => {
    const mixto = lote({ aprobadas: 4, rechazadas: 1, pendiente: 0 });
    const retrabajo1 = lote({ cantidad: 1, rechazadas: 1, pendiente: 0, informe_rechazo_id: "inf-1" });
    expect(resumirLotes([mixto, retrabajo1]).enRetrabajo).toBe(1);
    const retrabajo2 = lote({ cantidad: 1, aprobadas: 1, pendiente: 0, informe_rechazo_id: "inf-2" });
    expect(resumirLotes([mixto, retrabajo1, retrabajo2]).enRetrabajo).toBe(0);
  });
});

describe("lotesPorEvaluar", () => {
  it("solo vigentes con piezas pendientes, del más antiguo al más nuevo", () => {
    const base = { vigente: true, pendiente: 2, numero_pedido: "PM-1" };
    const lista = lotesPorEvaluar([
      { ...base, verificada_en: "2026-10-08T15:00:00Z" },
      { ...base, verificada_en: "2026-10-07T15:00:00Z" },
      { ...base, verificada_en: "2026-10-06T15:00:00Z", pendiente: 0 },
      { ...base, verificada_en: "2026-10-05T15:00:00Z", vigente: false },
    ]);
    expect(lista.map((l) => l.verificada_en)).toEqual(["2026-10-07T15:00:00Z", "2026-10-08T15:00:00Z"]);
  });
});

describe("leerPiezas y validarEvaluacion", () => {
  it("lee vacío como cero, acepta coma y rechaza negativos o texto", () => {
    expect(leerPiezas("")).toBe(0);
    expect(leerPiezas("0")).toBe(0);
    expect(leerPiezas("2,5")).toBe(2.5);
    expect(leerPiezas("-1")).toBeNaN();
    expect(leerPiezas("dos")).toBeNaN();
  });

  it("no deja pasar del lote ni rechazar sin motivo", () => {
    expect(validarEvaluacion(5, 0, 5, "")).toBeNull();
    expect(validarEvaluacion(4, 1, 5, "rayado")).toBeNull();
    expect(validarEvaluacion(0, 0, 5, "")).toMatch(/Indica/);
    expect(validarEvaluacion(5, 1, 5, "x")).toMatch(/solo tiene 5/);
    expect(validarEvaluacion(4, 1, 5, "  ")).toMatch(/motivo/);
    expect(validarEvaluacion(NaN, 0, 5, "")).toMatch(/válidas/);
  });
});

describe("estado de un mueble en la tabla de Calidad", () => {
  const mueble = (lotes: ReturnType<typeof resumirLotes>, extra: object = {}) => ({
    id: "m",
    estadoRevision: null,
    informes: [] as { aprobado: boolean }[],
    evaluable: lotes.verificadas > 0,
    lotes,
    ...extra,
  });

  it("sale de las piezas, no del último informe", () => {
    const enRetrabajo = resumirLotes([lote({ aprobadas: 4, rechazadas: 1, pendiente: 0 })]);
    // Aunque el último folio fuera el aprobado, quedan piezas en retrabajo.
    expect(estadoDe(mueble(enRetrabajo, { informes: [{ aprobado: true }] }))).toBe("no_aprobado");
    expect(estadoDe(mueble(resumirLotes([lote()])))).toBe("sin_evaluar");
    expect(estadoDe(mueble(resumirLotes([lote({ aprobadas: 5, pendiente: 0 })])))).toBe("aprobado");
  });

  it("sin lotes, un mueble manda su último informe (evaluado con la verificación apagada)", () => {
    const sinLotes = resumirLotes([]);
    expect(estadoDe(mueble(sinLotes))).toBe("sin_evaluar");
    expect(estadoDe(mueble(sinLotes, { informes: [{ aprobado: true }] }))).toBe("aprobado");
    expect(estadoDe(mueble(sinLotes, { informes: [{ aprobado: false }] }))).toBe("no_aprobado");
  });

  it("aprobar todos toma un mueble sin lotes solo si la base deja evaluarlo y nunca se evaluó", () => {
    const sinLotes = resumirLotes([]);
    expect(
      idsPorAprobar([
        mueble(sinLotes, { id: "verificacion-apagada", evaluable: true }),
        mueble(sinLotes, { id: "esperando-a-produccion", evaluable: false }),
        mueble(sinLotes, { id: "ya-evaluado", evaluable: true, informes: [{ aprobado: true }] }),
      ])
    ).toEqual(["verificacion-apagada"]);
  });

  it("aprobar todos toma los muebles con piezas por evaluar", () => {
    expect(
      idsPorAprobar([
        mueble(resumirLotes([lote()]), { id: "con-pendientes" }),
        mueble(resumirLotes([lote({ aprobadas: 5, pendiente: 0 })]), { id: "evaluado" }),
        mueble(resumirLotes([lote()]), { id: "cancelado", estadoRevision: "cancelado" }),
      ])
    ).toEqual(["con-pendientes"]);
  });
});
