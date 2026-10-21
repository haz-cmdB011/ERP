import { describe, expect, it } from "vitest";
import {
  formatoFechaHora,
  lineaTiempoMueble,
  type AsignacionTiempo,
  type DatosLineaTiempo,
  type EntregaTiempo,
} from "./linea-tiempo-mueble";

const VACIO: DatosLineaTiempo = {
  unidad: "pz",
  liberado: null,
  hoja: null,
  asignaciones: [],
  entregas: [],
  informes: [],
  revisiones: [],
  cobros: [],
  nombres: new Map(),
};

const ASIGNACION: AsignacionTiempo = {
  id: "a1",
  equipo: "Maquilas López",
  proceso: "armado",
  vez_paso: 1,
  veces_proceso: 1,
  cantidad: 10,
  creado_en: "2026-10-10T15:00:00Z",
  creado_por: "u-prod",
  cancelada_en: null,
  cancelada_por: null,
  motivo_cancelacion: null,
  adelantada: false,
  folio_rechazo: null,
  folio_revision_final: null,
};

const ENTREGA: EntregaTiempo = {
  id: "e1",
  asignacion_id: "a1",
  cantidad: 4,
  registrado_en: "2026-10-12T16:00:00Z",
  registrado_por: "u-prod",
  anulada_en: null,
  motivo_anulacion: null,
  verificada_en: "2026-10-12T16:00:00Z",
  rechazada_en: null,
  motivo_rechazo: null,
  fotoUrl: "https://foto",
};

describe("lineaTiempoMueble", () => {
  it("sin nada registrado queda vacía", () => {
    expect(lineaTiempoMueble(VACIO)).toEqual([]);
  });

  it("ordena de lo más reciente a lo más antiguo y pone nombres", () => {
    const eventos = lineaTiempoMueble({
      ...VACIO,
      liberado: { en: "2026-10-09T10:00:00Z", por: "u-plan" },
      hoja: { folio: "PRD-000123", en: "2026-10-09T11:00:00Z" },
      asignaciones: [ASIGNACION],
      entregas: [ENTREGA],
      informes: [
        {
          id: "i1",
          folio: "CAL-000045",
          aprobado: true,
          cantidad: 4,
          elaborado_en: "2026-10-13T09:00:00Z",
          elaborado_por: "u-cal",
          tipo_reporte: null,
          componente: null,
        },
      ],
      nombres: new Map([
        ["u-plan", "Ana Planeación"],
        ["u-prod", "Beto Taller"],
        ["u-cal", "Caro Calidad"],
      ]),
    });
    expect(eventos.map((e) => e.titulo)).toEqual([
      "Calidad aprobó 4 pz",
      "Maquilas López entregó 4 pz",
      "Asignado a Maquilas López: 10 pz",
      "Se generó la hoja de viajero",
      "Liberado a Producción",
    ]);
    expect(eventos.map((e) => e.quien)).toEqual([
      "Caro Calidad",
      "Beto Taller",
      "Beto Taller",
      null,
      "Ana Planeación",
    ]);
    expect(eventos[1]).toMatchObject({
      detalle: "Armado · Producción la preaprobó: pasa a Calidad",
      tono: "bien",
      fotoUrl: "https://foto",
    });
  });

  it("a la misma hora deja la asignación antes que su entrega (lo más reciente arriba)", () => {
    const eventos = lineaTiempoMueble({
      ...VACIO,
      asignaciones: [{ ...ASIGNACION, creado_en: ENTREGA.registrado_en }],
      entregas: [ENTREGA],
    });
    expect(eventos.map((e) => e.id)).toEqual(["entrega-e1", "asignacion-a1"]);
  });

  it("marca retrabajo, adelantada, el proceso repetido y la cancelación", () => {
    const eventos = lineaTiempoMueble({
      ...VACIO,
      asignaciones: [
        {
          ...ASIGNACION,
          vez_paso: 2,
          veces_proceso: 2,
          adelantada: true,
          folio_revision_final: "FIN-000007",
          cancelada_en: "2026-10-11T15:00:00Z",
          cancelada_por: "u-prod",
          motivo_cancelacion: "Se asignó al equipo equivocado",
        },
      ],
    });
    expect(eventos[0]).toMatchObject({
      titulo: "Se canceló la asignación a Maquilas López: 10 pz",
      detalle: "Armado 2 · Se asignó al equipo equivocado",
    });
    expect(eventos[1]).toMatchObject({
      titulo: "Retrabajo asignado a Maquilas López: 10 pz",
      detalle: "Armado 2 · por el rechazo FIN-000007 · antes de que el paso anterior entregara",
      tono: "aviso",
    });
  });

  it("dice cómo quedó cada entrega", () => {
    const tonos = lineaTiempoMueble({
      ...VACIO,
      asignaciones: [ASIGNACION],
      entregas: [
        { ...ENTREGA, id: "v", registrado_en: "2026-10-12T16:00:00Z" },
        {
          ...ENTREGA,
          id: "r",
          registrado_en: "2026-10-12T17:00:00Z",
          verificada_en: null,
          rechazada_en: "2026-10-12T17:00:00Z",
          motivo_rechazo: "Rayones",
        },
        { ...ENTREGA, id: "p", registrado_en: "2026-10-12T18:00:00Z", verificada_en: null },
        {
          ...ENTREGA,
          id: "x",
          registrado_en: "2026-10-12T19:00:00Z",
          anulada_en: "2026-10-12T19:30:00Z",
          motivo_anulacion: "Foto equivocada",
        },
      ],
    })
      .filter((e) => e.id.startsWith("entrega-"))
      .map((e) => [e.id, e.tono, e.detalle]);
    expect(tonos).toEqual([
      ["entrega-x", "neutro", "Armado · Anulada: Foto equivocada"],
      ["entrega-p", "aviso", "Armado · Falta que Producción la revise"],
      ["entrega-r", "mal", "Armado · No cumplió: Rayones"],
      ["entrega-v", "bien", "Armado · Producción la preaprobó: pasa a Calidad"],
    ]);
  });

  it("informes de componentes, no conformidades y rechazos de Calidad", () => {
    const eventos = lineaTiempoMueble({
      ...VACIO,
      informes: [
        {
          id: "c",
          folio: "CAL-1",
          aprobado: true,
          cantidad: null,
          elaborado_en: "2026-10-13T09:00:00Z",
          elaborado_por: null,
          tipo_reporte: null,
          componente: "Componente 3 · CAJÓN",
        },
        {
          id: "n",
          folio: "CAL-2",
          aprobado: false,
          cantidad: 1,
          elaborado_en: "2026-10-14T09:00:00Z",
          elaborado_por: null,
          tipo_reporte: "Producto No Conforme",
          componente: null,
        },
        {
          id: "r",
          folio: "CAL-3",
          aprobado: false,
          cantidad: 2,
          elaborado_en: "2026-10-15T09:00:00Z",
          elaborado_por: null,
          tipo_reporte: null,
          componente: null,
        },
      ],
    });
    expect(eventos.map((e) => [e.titulo, e.detalle, e.tono])).toEqual([
      ["Calidad rechazó 2 pz", "CAL-3", "mal"],
      ["Calidad levantó Producto No Conforme", "CAL-2", "mal"],
      ["Calidad aprobó", "Componente 3 · CAJÓN · CAL-1", "bien"],
    ]);
  });

  it("revisión final: aprobada con su folio y rechazada con origen y regreso", () => {
    const eventos = lineaTiempoMueble({
      ...VACIO,
      revisiones: [
        {
          id: "f1",
          folio: "FIN-000001",
          aprobado: true,
          cantidad: 8,
          motivo: null,
          elaborado_en: "2026-10-20T09:00:00Z",
          elaborado_por: null,
          origen: null,
          regresaA: null,
        },
        {
          id: "f2",
          folio: "FIN-000002",
          aprobado: false,
          cantidad: 2,
          motivo: "Tono disparejo",
          elaborado_en: "2026-10-20T10:00:00Z",
          elaborado_por: null,
          origen: "Barniz",
          regresaA: "Barniz",
        },
      ],
    });
    expect(eventos.map((e) => [e.titulo, e.detalle])).toEqual([
      ["Revisión final: rechazó 2 pz", "Tono disparejo · nació en Barniz · regresa a Barniz · FIN-000002"],
      ["Revisión final: aprobó 8 pz", "FIN-000001"],
    ]);
  });
});

describe("pago al maquilador en la línea de tiempo", () => {
  it("el cobro en el recibo y, ya pagado, el pago", () => {
    const comun = {
      area: "armado" as const,
      contratista: "Maquilas López",
      capturado_por: "u-maq",
      pagado_por: "u-est",
    };
    const eventos = lineaTiempoMueble({
      ...VACIO,
      cobros: [
        {
          ...comun,
          reciboId: "r1",
          folio: "ARM-0001",
          estado: "pagado",
          cantidad: 5,
          reproceso: 1,
          creado_en: "2026-10-20T10:00:00Z",
          pagado_en: "2026-10-22T10:00:00Z",
        },
        {
          ...comun,
          reciboId: "r2",
          folio: "ARM-0002",
          estado: "revisado",
          cantidad: 2,
          reproceso: 0,
          creado_en: "2026-10-21T10:00:00Z",
          pagado_en: null,
        },
      ],
      nombres: new Map([
        ["u-maq", "Luis López"],
        ["u-est", "Eva Estimaciones"],
      ]),
    });
    expect(eventos.map((e) => [e.titulo, e.detalle, e.quien, e.tono])).toEqual([
      ["Se pagó el recibo ARM-0001", "Armado · Maquilas López", "Eva Estimaciones", "bien"],
      ["Maquilas López cobró 2 pz en ARM-0002", "Armado", "Luis López", "neutro"],
      ["Maquilas López cobró 5 pz en ARM-0001", "Armado · más 1 pz de reproceso", "Luis López", "neutro"],
    ]);
  });
});

describe("formatoFechaHora", () => {
  it("muestra la hora de México en 24 h", () => {
    // 20:05 UTC = 14:05 en Ciudad de México (UTC-6, sin horario de verano).
    expect(formatoFechaHora("2026-10-21T20:05:00Z")).toBe("21/10/2026 14:05");
  });
});
