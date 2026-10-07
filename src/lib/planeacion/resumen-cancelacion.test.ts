import { describe, expect, it } from "vitest";
import { resumirCancelacion, textoCancelacion, type ItemParaCancelar } from "./resumen-cancelacion";

function item(extra: Partial<ItemParaCancelar>): ItemParaCancelar {
  return {
    tipo_registro: "MO",
    estado_liberacion: "pendiente",
    estado_revision: null,
    eliminacion_solicitada_en: null,
    ...extra,
  };
}

describe("resumirCancelacion", () => {
  it("cuenta muebles, componentes y los ya liberados", () => {
    const r = resumirCancelacion([
      item({ tipo_registro: "MO", estado_liberacion: "enviado_a_produccion" }),
      item({ tipo_registro: "MO" }),
      item({ tipo_registro: "FU", estado_liberacion: "enviado_a_produccion" }),
      item({ tipo_registro: "FU" }),
      item({ tipo_registro: "FU" }),
    ]);
    expect(r).toEqual({ muebles: 2, componentes: 3, liberados: 2 });
  });

  it("no cuenta lo cancelado ni lo que está en la papelera", () => {
    const r = resumirCancelacion([
      item({}),
      item({ estado_revision: "cancelado" }),
      item({ eliminacion_solicitada_en: "2026-10-01T10:00:00Z" }),
      item({ estado_revision: "en_revision" }),
    ]);
    expect(r.muebles).toBe(2);
  });

  it("sin ítems da ceros", () => {
    expect(resumirCancelacion([])).toEqual({ muebles: 0, componentes: 0, liberados: 0 });
  });
});

describe("textoCancelacion", () => {
  it("dice cuántos muebles y componentes se cancelan", () => {
    expect(textoCancelacion({ muebles: 12, componentes: 48, liberados: 0 })).toBe(
      "Se cancelarán 12 muebles y 48 componentes."
    );
  });

  it("avisa de los liberados a Producción", () => {
    expect(textoCancelacion({ muebles: 3, componentes: 0, liberados: 1 })).toBe(
      "Se cancelarán 3 muebles; 1 ya está liberado a Producción."
    );
    expect(textoCancelacion({ muebles: 3, componentes: 2, liberados: 4 })).toBe(
      "Se cancelarán 3 muebles y 2 componentes; 4 ya están liberados a Producción."
    );
  });

  it("concuerda en singular", () => {
    expect(textoCancelacion({ muebles: 1, componentes: 0, liberados: 0 })).toBe("Se cancelará 1 mueble.");
    expect(textoCancelacion({ muebles: 0, componentes: 1, liberados: 0 })).toBe("Se cancelará 1 componente.");
  });

  it("sin ítems vigentes lo dice", () => {
    expect(textoCancelacion({ muebles: 0, componentes: 0, liberados: 0 })).toBe(
      "Este pedido no tiene ítems vigentes que cancelar."
    );
  });
});
