import { describe, expect, it } from "vitest";
import {
  DETALLE_VACIO,
  argumentosDetalle,
  deteccionSugerida,
  estatusNoConformidad,
  nombresDeAreas,
  origenSugerido,
  periodoProduccion,
  responsablesDeArea,
  validarDetalle,
} from "./no-conformidad";

const completo = {
  ...DETALLE_VACIO,
  tipoReporte: "Producto No Conforme",
  motivoCodigo: "0013",
  areaDeteccion: "CALIDAD",
  responsableDeteccion: "SUHEILLI GALICIA",
  areaOrigen: "PROD-ARMADO-MAD",
  responsableOrigen: "RUBEN BELTRAN",
  accionesCorrectivas: "Reajustar herrajes",
};

const areas = [
  { area: "BARNIZ", responsable: "RUBEN BELTRAN" },
  { area: "CALIDAD", responsable: "SUHEILLI GALICIA" },
  { area: "CLIENTE", responsable: null },
  { area: "MAQUILADOR", responsable: null },
  { area: "PROD-ARMADO-MAD", responsable: "RUBEN BELTRAN" },
  { area: "PROYECTOS", responsable: "ERICK SANCHEZ" },
  { area: "PROYECTOS", responsable: "JAIRO GONZALEZ" },
];

describe("validarDetalle", () => {
  it("pide cada dato obligatorio, menos solución, autoriza, material, mano de obra, severidad y causa raíz", () => {
    expect(validarDetalle(DETALLE_VACIO, false)).toMatch(/tipo de reporte/);
    expect(validarDetalle({ ...completo, motivoCodigo: "" }, false)).toMatch(/motivo/);
    expect(validarDetalle({ ...completo, areaDeteccion: "" }, false)).toMatch(/donde se detectó/);
    expect(validarDetalle({ ...completo, responsableDeteccion: "" }, false)).toMatch(/área donde se detectó/);
    expect(validarDetalle({ ...completo, areaOrigen: " " }, false)).toMatch(/área de origen/);
    expect(validarDetalle({ ...completo, responsableOrigen: "" }, false)).toMatch(/área de origen/);
    expect(validarDetalle({ ...completo, accionesCorrectivas: "" }, false)).toMatch(/acciones correctivas/);
    expect(validarDetalle(completo, false)).toBeNull();
  });

  it("las piezas afectadas son obligatorias sin lote y opcionales con lote", () => {
    expect(validarDetalle(completo, true)).toMatch(/piezas/);
    expect(validarDetalle({ ...completo, piezasAfectadas: "0" }, true)).toMatch(/piezas/);
    expect(validarDetalle({ ...completo, piezasAfectadas: "2,5" }, true)).toBeNull();
    expect(validarDetalle({ ...completo, piezasAfectadas: "abc" }, false)).toMatch(/piezas/);
  });
});

describe("argumentosDetalle", () => {
  it("recorta textos y manda nulos en lo opcional vacío", () => {
    const a = argumentosDetalle("i1", { ...completo, tipoReporte: "  Incidencia  " });
    expect(a).toMatchObject({
      p_tipo_reporte: "Incidencia",
      p_motivo_codigo: "0013",
      p_area_origen: "PROD-ARMADO-MAD",
      p_solucion: null,
      p_autoriza: null,
      p_material: null,
      p_severidad: null,
      p_piezas_afectadas: null,
    });
    expect(argumentosDetalle("i1", { ...completo, piezasAfectadas: "3", severidad: "alta", material: "Tornillos" })).toMatchObject({
      p_piezas_afectadas: 3,
      p_severidad: "alta",
      p_material: "Tornillos",
    });
  });
});

describe("áreas y responsables", () => {
  it("lista áreas sin repetir y sus responsables (puede no haber)", () => {
    expect(nombresDeAreas(areas)).toContain("PROYECTOS");
    expect(nombresDeAreas(areas).filter((a) => a === "PROYECTOS")).toHaveLength(1);
    expect(responsablesDeArea(areas, "PROYECTOS")).toEqual(["ERICK SANCHEZ", "JAIRO GONZALEZ"]);
    expect(responsablesDeArea(areas, "CLIENTE")).toEqual([]);
  });
});

describe("sugerencias automáticas", () => {
  it("un maquilador es el área MAQUILADOR y su responsable es su encargado o su nombre", () => {
    expect(origenSugerido({ proceso: "armado", equipo: "Equipo 3", esPlanta: false, encargado: "Juan Pérez" }, areas)).toEqual({
      areaOrigen: "MAQUILADOR",
      responsableOrigen: "Juan Pérez",
    });
    expect(origenSugerido({ proceso: "barniz", equipo: "Equipo 3", esPlanta: false, encargado: null }, areas)?.responsableOrigen).toBe(
      "Equipo 3"
    );
  });

  it("la planta toma el área de su proceso y el responsable del catálogo", () => {
    expect(origenSugerido({ proceso: "armado", equipo: "Planta", esPlanta: true, encargado: null }, areas)).toEqual({
      areaOrigen: "PROD-ARMADO-MAD",
      responsableOrigen: "RUBEN BELTRAN",
    });
    expect(origenSugerido({ proceso: "barniz", equipo: "Planta", esPlanta: true, encargado: "Otro" }, areas)).toEqual({
      areaOrigen: "BARNIZ",
      responsableOrigen: "Otro",
    });
  });

  it("no propone un área que no esté en el catálogo", () => {
    expect(origenSugerido({ proceso: "armado", equipo: "Planta", esPlanta: true, encargado: null }, [])).toBeNull();
    expect(deteccionSugerida([])).toBeNull();
  });

  it("la detección por defecto es Calidad", () => {
    expect(deteccionSugerida(areas)).toEqual({ areaDeteccion: "CALIDAD", responsableDeteccion: "SUHEILLI GALICIA" });
  });
});

describe("estatusNoConformidad", () => {
  const lote = { esLote: true, cerradoEn: null, piezasRechazadas: 4, asignacionesRetrabajo: 0, piezasAprobadasRetrabajo: 0, fechaUltimaAprobacion: null };

  it("sin lote se cierra solo a mano", () => {
    expect(estatusNoConformidad({ ...lote, esLote: false })).toEqual({ estatus: "abierto", fecha: null });
    expect(estatusNoConformidad({ ...lote, esLote: false, cerradoEn: "2026-10-14" })).toEqual({ estatus: "cerrado", fecha: "2026-10-14" });
  });

  it("de un lote: abierto → en proceso con el retrabajo → cerrado al aprobar todas las piezas", () => {
    expect(estatusNoConformidad(lote).estatus).toBe("abierto");
    expect(estatusNoConformidad({ ...lote, asignacionesRetrabajo: 1 }).estatus).toBe("en_proceso");
    expect(estatusNoConformidad({ ...lote, asignacionesRetrabajo: 1, piezasAprobadasRetrabajo: 3 }).estatus).toBe("en_proceso");
    expect(
      estatusNoConformidad({ ...lote, asignacionesRetrabajo: 2, piezasAprobadasRetrabajo: 4, fechaUltimaAprobacion: "2026-10-20" })
    ).toEqual({ estatus: "cerrado", fecha: "2026-10-20" });
  });
});

describe("periodoProduccion", () => {
  it("sin asignaciones no hay periodo", () => {
    expect(periodoProduccion([], [])).toEqual({ inicio: null, termino: null });
  });

  it("inicio = primera asignación; término = última entrega, solo si todo se entregó", () => {
    const entregas = [{ fecha_entrega: "2026-10-09" }, { fecha_entrega: "2026-10-12" }];
    expect(
      periodoProduccion(
        [
          { fecha_asignacion: "2026-10-05", cantidad: 4, entregado: 4 },
          { fecha_asignacion: "2026-10-02", cantidad: 6, entregado: 6 },
        ],
        entregas
      )
    ).toEqual({ inicio: "2026-10-02", termino: "2026-10-12" });
    expect(
      periodoProduccion([{ fecha_asignacion: "2026-10-02", cantidad: 6, entregado: 3 }], entregas)
    ).toEqual({ inicio: "2026-10-02", termino: null });
  });
});
