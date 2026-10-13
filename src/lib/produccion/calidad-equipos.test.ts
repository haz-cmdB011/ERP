import { describe, expect, it } from "vitest";
import { inicioPeriodo, leerPeriodo, metricasPorEquipo, porcentaje } from "./calidad-equipos";

const entrega = (id: string, asignacion_id: string, cantidad: number, extra: object = {}) => ({
  id,
  asignacion_id,
  cantidad,
  verificada_en: null as string | null,
  rechazada_en: null as string | null,
  anulada_en: null as string | null,
  ...extra,
});
const V = "2026-10-08T15:00:00Z";

describe("metricasPorEquipo", () => {
  const asignaciones = [
    { id: "a1", equipo_id: "eq1" },
    { id: "a2", equipo_id: "eq1" },
    { id: "a3", equipo_id: "eq2" },
  ];

  it("separa el rechazo de Producción del de Calidad, por equipo", () => {
    const [eq1, eq2] = metricasPorEquipo(
      [
        entrega("e1", "a1", 10, { verificada_en: V }),
        entrega("e2", "a2", 5, { rechazada_en: V }),
        entrega("e3", "a1", 3, { anulada_en: V }), // captura por error: no cuenta
        entrega("e4", "a3", 4), // sin revisar todavía
      ],
      asignaciones,
      [
        { entrega_id: "e1", aprobado: true, cantidad: 8, categoria: null },
        { entrega_id: "e1", aprobado: false, cantidad: 2, categoria: "acabado" },
      ]
    ).sort((a, b) => a.equipoId.localeCompare(b.equipoId));

    expect(eq1).toMatchObject({
      entregadas: 15,
      verificadas: 10,
      rechazadasProduccion: 5,
      evaluadas: 10,
      aprobadas: 8,
      rechazadasCalidad: 2,
      defectos: [{ categoria: "acabado", piezas: 2 }],
    });
    expect(eq1.rechazoInterno).toBeCloseTo(5 / 15);
    expect(eq1.rechazoCalidad).toBeCloseTo(0.2);
    // Sin nada revisado ni evaluado, las tasas no se inventan.
    expect(eq2).toMatchObject({ entregadas: 4, rechazoInterno: null, rechazoCalidad: null });
  });

  it("ordena los defectos de más a menos piezas", () => {
    const [m] = metricasPorEquipo(
      [entrega("e1", "a1", 10, { verificada_en: V })],
      asignaciones,
      [
        { entrega_id: "e1", aprobado: false, cantidad: 1, categoria: "medidas" },
        { entrega_id: "e1", aprobado: false, cantidad: 3, categoria: "acabado" },
        { entrega_id: "e1", aprobado: false, cantidad: 2, categoria: null },
      ]
    );
    expect(m.defectos.map((d) => d.categoria)).toEqual(["acabado", null, "medidas"]);
  });
});

describe("periodos y porcentaje", () => {
  it("lee el periodo con 90 días por omisión y calcula su inicio", () => {
    expect(leerPeriodo("30")).toBe("30");
    expect(leerPeriodo("x")).toBe("90");
    expect(inicioPeriodo("30", "2026-10-08")).toBe("2026-09-09");
    expect(inicioPeriodo("todo", "2026-10-08")).toBeNull();
  });

  it("formatea fracciones y deja guion sin datos", () => {
    expect(porcentaje(0.125)).toBe("13 %");
    expect(porcentaje(null)).toBe("—");
  });
});
