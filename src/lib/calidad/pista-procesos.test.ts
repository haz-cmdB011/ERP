import { describe, expect, it } from "vitest";
import { pistaDeProcesos } from "./pista-procesos";
import type { LoteCalidad } from "./lotes";
import type { Proceso } from "@/lib/produccion/asignaciones";

function lote(p: Partial<LoteCalidad> & { entrega_id: string; proceso: Proceso }): LoteCalidad {
  return {
    asignacion_id: "a",
    planeacion_item_id: "m",
    pedido_id: "p",
    numero_pedido: "PM1",
    item_code: 1,
    modelo: "M",
    descripcion: null,
    unidad: "PZA",
    equipo_id: "e",
    equipo: "Emilio",
    informe_rechazo_id: null,
    folio_rechazo: null,
    fecha_entrega: "2026-11-06",
    verificada_en: "2026-11-06T10:00:00Z",
    cantidad: 1,
    aprobadas: 0,
    rechazadas: 0,
    pendiente: 0,
    vigente: true,
    folio_hoja: null,
    vez_paso: 1,
    veces_proceso: 1,
    ...p,
  };
}

const ruta = (...ps: Proceso[]) => ps.map((proceso) => ({ id: proceso, proceso }));

describe("pistaDeProcesos", () => {
  it("separa lo aprobado por proceso en vez de sumarlo", () => {
    const pista = pistaDeProcesos(
      [
        lote({ entrega_id: "e1", proceso: "armado", aprobadas: 1 }),
        lote({ entrega_id: "e2", proceso: "barniz", aprobadas: 1 }),
      ],
      [
        { id: "i1", folio: "CAL-1", aprobado: true, cantidad: 1, elaborado_en: "2026-11-06T11:00:00Z", entrega_id: "e1" },
        { id: "i2", folio: "CAL-2", aprobado: true, cantidad: 1, elaborado_en: "2026-11-06T12:00:00Z", entrega_id: "e2" },
      ],
      ruta("armado", "barniz", "electrificacion"),
      [],
      1
    );
    expect(pista.estaciones.map((e) => [e.etiqueta, e.aprobadas, e.estado])).toEqual([
      ["Armado", 1, "aprobado"],
      ["Barniz", 1, "aprobado"],
      ["Electrificación", 0, "sin_entregar"],
    ]);
    expect(pista.estaciones[1].informes.map((i) => i.folio)).toEqual(["CAL-2"]);
    expect(pista.completo).toBe(false);
  });

  it("lo pendiente queda en su proceso", () => {
    const pista = pistaDeProcesos(
      [
        lote({ entrega_id: "e1", proceso: "armado", aprobadas: 2, cantidad: 2 }),
        lote({ entrega_id: "e2", proceso: "barniz", pendiente: 2, cantidad: 2 }),
      ],
      [],
      ruta("armado", "barniz"),
      [],
      2
    );
    expect(pista.estaciones[1].estado).toBe("por_revisar");
    expect(pista.estaciones[1].pendientes.map((l) => l.entrega_id)).toEqual(["e2"]);
    expect(pista.estaciones[0].pendientes).toEqual([]);
  });

  it("un proceso repetido lleva su número", () => {
    const pista = pistaDeProcesos([], [], ruta("armado", "barniz", "armado"), [], 1);
    expect(pista.estaciones.map((e) => e.etiqueta)).toEqual(["Armado 1", "Barniz", "Armado 2"]);
  });

  it("por partes cuenta muebles con la parte más atrasada", () => {
    const parte = (id: string, nombre: string, aprobadas: number) =>
      lote({
        entrega_id: id,
        proceso: "armado",
        entrega_parte: true,
        vez_paso: null,
        parte_id: nombre,
        parte_descripcion: nombre,
        parte_piezas_por_mueble: 2,
        cantidad: aprobadas,
        aprobadas,
      });
    const pista = pistaDeProcesos([parte("p1", "Puerta", 6), parte("p2", "Marco", 2)], [], ruta("armado"), [], 3);
    const armado = pista.estaciones[0];
    expect(armado.aprobadas).toBe(1);
    expect(armado.partes).toEqual([
      expect.objectContaining({ descripcion: "Puerta", meta: 6, aprobadas: 6 }),
      expect.objectContaining({ descripcion: "Marco", meta: 6, aprobadas: 2 }),
    ]);
    expect(armado.estado).toBe("en_curso");
  });

  it("lo rechazado sin regresar queda en retrabajo", () => {
    const pista = pistaDeProcesos(
      [lote({ entrega_id: "e1", proceso: "armado", rechazadas: 1 })],
      [],
      ruta("armado"),
      [],
      1
    );
    expect(pista.estaciones[0].estado).toBe("en_retrabajo");
  });

  it("los folios sin entrega quedan aparte y lo entregado fuera de la ruta no se pierde", () => {
    const pista = pistaDeProcesos(
      [lote({ entrega_id: "e1", proceso: "electrificacion", aprobadas: 1 })],
      [{ id: "i9", folio: "CAL-9", aprobado: true, cantidad: null, elaborado_en: "2026-01-01" }],
      ruta("armado"),
      [],
      1
    );
    expect(pista.estaciones.map((e) => e.proceso)).toEqual(["armado", "electrificacion"]);
    expect(pista.sueltos.map((i) => i.folio)).toEqual(["CAL-9"]);
  });
});
