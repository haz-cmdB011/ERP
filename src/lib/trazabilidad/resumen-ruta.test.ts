import { describe, expect, it } from "vitest";
import { resumenRuta, resumenRutaDeArea, type EntradaRuta } from "./resumen-ruta";

const BASE: EntradaRuta = {
  liberado: true,
  cantidad: 7,
  unidad: "PZA",
  pasos: [
    { etiqueta: "Armado", estado: "en_proceso", entregado: 5 },
    { etiqueta: "Barniz", estado: "sin_asignar", entregado: 0 },
  ],
  revisionFinal: { aprobadas: 0, pendientes: 0, liberado: false },
  pago: { estado: "sin_recibo", cobrado: 0, pagado: 0 },
};

describe("resumenRuta", () => {
  it("va en el primer paso sin terminar, con lo entregado", () => {
    const r = resumenRuta(BASE);
    expect(r).toMatchObject({ titulo: "En Armado", detalle: "5 de 7 PZA entregadas", actual: 0 });
    expect(r.tramos.map((t) => [t.etiqueta, t.estado, t.texto, t.cifra])).toEqual([
      ["Armado", "en_curso", "En proceso", "5/7"],
      ["Barniz", "pendiente", "Sin asignar", null],
      ["Revisión final", "pendiente", "Esperando piezas", "0/7"],
      ["Pago al maquilador", "pendiente", "Sin recibo", null],
    ]);
  });

  it("un paso sin asignar dice que falta asignarlo, aunque los de después avancen", () => {
    const r = resumenRuta({
      ...BASE,
      pasos: [
        { etiqueta: "Armado", estado: "sin_asignar", entregado: 0 },
        { etiqueta: "Barniz", estado: "terminado", entregado: 2 },
      ],
    });
    expect(r).toMatchObject({ titulo: "Por asignar: Armado", detalle: null, actual: 0 });
    expect(r.tramos[1]).toMatchObject({ estado: "hecho", texto: "Terminado", cifra: "2/7" });
  });

  it("con la ruta terminada va en la revisión final", () => {
    const pasos = BASE.pasos.map((p) => ({ ...p, estado: "terminado" as const, entregado: 7 }));
    expect(resumenRuta({ ...BASE, pasos, revisionFinal: { aprobadas: 0, pendientes: 2, liberado: false } })).toMatchObject({
      titulo: "En revisión final",
      detalle: "2 PZA listas para revisar",
      actual: 2,
    });
    expect(
      resumenRuta({ ...BASE, pasos, revisionFinal: { aprobadas: 5, pendientes: 0, liberado: false } }).detalle
    ).toBe("Calidad aprobó 5 de 7 PZA");
  });

  it("liberado a obra: sigue el pago; todo pagado es el recorrido completo", () => {
    const pasos = BASE.pasos.map((p) => ({ ...p, estado: "terminado" as const, entregado: 7 }));
    const liberado = { aprobadas: 7, pendientes: 0, liberado: true };
    expect(resumenRuta({ ...BASE, pasos, revisionFinal: liberado })).toMatchObject({
      titulo: "Por cobrar",
      actual: 3,
    });
    expect(
      resumenRuta({ ...BASE, pasos, revisionFinal: liberado, pago: { estado: "por_pagar", cobrado: 14, pagado: 7 } })
    ).toMatchObject({ titulo: "Por pagar al maquilador", detalle: "Pagado 7 de 14 PZA cobradas" });
    expect(
      resumenRuta({ ...BASE, pasos, revisionFinal: liberado, pago: { estado: "pagado", cobrado: 14, pagado: 14 } })
    ).toMatchObject({ titulo: "Recorrido completo", actual: null });
  });

  it("con la revisión final apagada no es un tramo", () => {
    const r = resumenRuta({ ...BASE, revisionFinal: null });
    expect(r.tramos.map((t) => t.etiqueta)).toEqual(["Armado", "Barniz", "Pago al maquilador"]);
  });

  it("sin liberar no va en ningún tramo", () => {
    expect(resumenRuta({ ...BASE, liberado: false })).toMatchObject({
      titulo: "Sin liberar a Producción",
      actual: null,
    });
  });
});

describe("resumenRutaDeArea", () => {
  it("Producción solo ve sus pasos", () => {
    const r = resumenRutaDeArea(BASE, "produccion");
    expect(r).toMatchObject({ titulo: "En Armado", detalle: "5 de 7 PZA entregadas", actual: 0 });
    expect(r.tramos.map((t) => t.etiqueta)).toEqual(["Armado", "Barniz"]);
  });

  it("Calidad solo ve la revisión final; apagada, no ve nada", () => {
    expect(resumenRutaDeArea(BASE, "calidad").tramos.map((t) => t.etiqueta)).toEqual(["Revisión final"]);
    expect(resumenRutaDeArea({ ...BASE, revisionFinal: null }, "calidad").tramos).toEqual([]);
  });

  it("Estimaciones solo ve el pago", () => {
    const r = resumenRutaDeArea(BASE, "estimaciones");
    expect(r.tramos.map((t) => t.etiqueta)).toEqual(["Pago al maquilador"]);
    expect(r.titulo).toBe("Por cobrar");
  });

  it("Planeación solo ve la liberación", () => {
    expect(resumenRutaDeArea(BASE, "planeacion").tramos.map((t) => t.etiqueta)).toEqual(["Liberación a Producción"]);
    expect(resumenRutaDeArea({ ...BASE, liberado: false }, "planeacion").titulo).toBe("Sin liberar a Producción");
  });
});

describe("sin permiso de ver el pago", () => {
  it("la ruta completa no trae el paso del pago", () => {
    const r = resumenRuta({ ...BASE, pago: null });
    expect(r.tramos.map((t) => t.etiqueta)).toEqual(["Armado", "Barniz", "Revisión final"]);
  });

  it("Estimaciones sin pago no ve tramos", () => {
    expect(resumenRutaDeArea({ ...BASE, pago: null }, "estimaciones").tramos).toEqual([]);
  });
});
