import { describe, expect, it } from "vitest";
import type { RenglonHistorico } from "./datos-acabados";
import {
  precedenteDe,
  resolver,
  type ConfiguracionMotor,
  type EntradaRenglon,
} from "./motor-precio";
import { TARIFAS_BASE_ARMADO, TARIFAS_FIJAS_ARMADO } from "./datos-armado";

const CFG_ACABADOS: ConfiguracionMotor = {
  nivel3Visible: true,
  recargoAcabado2: 0,
  tarifasProyecto: [],
};

// Armado: sin tarifas propias (las de Acabados no aplican).
const CFG_ARMADO: ConfiguracionMotor = {
  nivel3Visible: true,
  recargoAcabado2: 0,
  tarifasProyecto: [],
  tarifasFijas: TARIFAS_FIJAS_ARMADO,
  tarifasBase: TARIFAS_BASE_ARMADO,
};

const RECIBO = { ot: "", prioridad: "normal" };

function entrada(cambios: Partial<EntradaRenglon>): EntradaRenglon {
  return {
    modelo: "X-1",
    familia: "Puerta",
    tamano: "",
    cantidad: 1,
    acabado: "",
    acabado2: "",
    ...cambios,
  };
}

// En Armado el tipo de armado viaja en `acabado` y la colocación de herrajes
// ("Sí" / "No") en `acabado2` del histórico.
function historicoArmado(
  modelo: string,
  tipo: string,
  aceptado: number,
  fecha: string,
  herrajes: "Sí" | "No" = "No"
): RenglonHistorico {
  return {
    modelo,
    familia: "Puerta",
    acabado: tipo,
    acabado2: herrajes,
    cantidad: 1,
    propuesto: aceptado,
    aceptado,
    fecha,
    folio: "1",
    obra: "",
    ot: "",
  };
}

describe("Acabados: el comportamiento no cambia", () => {
  it("usa las tarifas fijas y base de Acabados por defecto", () => {
    const zoclo = resolver(entrada({ modelo: "ZOCLO", familia: "Zoclo" }), RECIBO, CFG_ACABADOS, []);
    expect(zoclo.fuente).toBe("tarifa_fija");
    expect(zoclo.pu).toBe(20);

    const puerta = resolver(entrada({ familia: "Puerta" }), RECIBO, CFG_ACABADOS, []);
    expect(puerta.fuente).toBe("familia");
    expect(puerta.pu).toBe(700);
  });
});

describe("Armado: motor propio", () => {
  it("no aplica las tarifas de Acabados: sin precedente queda manual", () => {
    const zoclo = resolver(
      entrada({ modelo: "ZOCLO", familia: "Zoclo", acabado: "Natural", tipoArmado: "Natural" }),
      RECIBO,
      CFG_ARMADO,
      []
    );
    expect(zoclo.fuente).toBe("manual");
    expect(zoclo.pu).toBeNull();
  });

  it("el precedente se busca por modelo Y tipo de armado", () => {
    const historico = [
      historicoArmado("P-1", "Natural", 300, "2026-01-10"),
      historicoArmado("P-1", "Laminado", 500, "2026-02-10"),
    ];
    expect(precedenteDe("P-1", historico, "Natural")?.aceptado).toBe(300);
    expect(precedenteDe("P-1", historico, "Laminado")?.aceptado).toBe(500);
    expect(precedenteDe("P-1", historico, "Colocación de herrajes")).toBeNull();
  });

  it("la colocación de herrajes (Sí / No) también distingue el precedente", () => {
    const historico = [
      historicoArmado("P-1", "Natural", 300, "2026-01-10", "No"),
      historicoArmado("P-1", "Natural", 380, "2026-02-10", "Sí"),
    ];
    expect(precedenteDe("P-1", historico, "Natural", false)?.aceptado).toBe(300);
    expect(precedenteDe("P-1", historico, "Natural", true)?.aceptado).toBe(380);
    // Sin indicar herrajes no se filtra por eso (comportamiento de Acabados).
    expect(precedenteDe("P-1", historico, "Natural")?.aceptado).toBe(380); // el más reciente
    expect(precedenteDe("P-2", historico, "Natural", true)).toBeNull();
  });

  it("sin tipo de armado, el precedente sigue siendo por modelo (Acabados)", () => {
    const historico = [
      historicoArmado("P-1", "Laca Mate", 100, "2026-01-10"),
      historicoArmado("P-1", "Laca Brillante", 200, "2026-03-10"),
    ];
    expect(precedenteDe("P-1", historico)?.aceptado).toBe(200); // el más reciente
  });

  it("el precedente es el precio ya pagado, tal cual (sin volumen ni prioridad)", () => {
    const historico = [historicoArmado("P-1", "Natural", 300, "2026-01-10")];
    const res = resolver(
      entrada({
        modelo: "P-1",
        cantidad: 4,
        acabado: "Natural",
        tipoArmado: "Natural",
        herrajes: false,
      }),
      { ot: "", prioridad: "urgente" },
      CFG_ARMADO,
      historico
    );
    expect(res.fuente).toBe("precedente");
    expect(res.pu).toBe(300);
  });
});

describe("Precedente: solo lo ya pagado, antes que el paramétrico", () => {
  const pagado = (cambios: Partial<RenglonHistorico>): RenglonHistorico => ({
    modelo: "ZOCLO",
    familia: "Zoclo",
    acabado: "",
    acabado2: "",
    cantidad: 1,
    propuesto: 30,
    aceptado: 28,
    fecha: "2026-09-01",
    folio: "10",
    obra: "",
    ot: "193-24",
    estado: "pagado",
    ...cambios,
  });

  it("un antecedente pagado gana a la tarifa fija y a la de familia", () => {
    const zoclo = resolver(entrada({ modelo: "ZOCLO", familia: "Zoclo" }), RECIBO, CFG_ACABADOS, [pagado({})]);
    expect(zoclo.fuente).toBe("precedente");
    expect(zoclo.pu).toBe(28);

    const puerta = resolver(
      entrada({ modelo: "P-9", familia: "Puerta" }),
      RECIBO,
      CFG_ACABADOS,
      [pagado({ modelo: "P-9", familia: "Puerta", aceptado: 650 })]
    );
    expect(puerta.fuente).toBe("precedente");
    expect(puerta.pu).toBe(650);
  });

  it("sin antecedente pagado propone el paramétrico", () => {
    for (const estado of ["pendiente", "revisado", "cancelado"]) {
      const zoclo = resolver(entrada({ modelo: "ZOCLO", familia: "Zoclo" }), RECIBO, CFG_ACABADOS, [
        pagado({ estado }),
      ]);
      expect(zoclo.fuente, estado).toBe("tarifa_fija");
      expect(zoclo.pu, estado).toBe(20);
    }
    // Pagado pero sin precio aceptado no es antecedente.
    const sinPrecio = resolver(entrada({ modelo: "ZOCLO", familia: "Zoclo" }), RECIBO, CFG_ACABADOS, [
      pagado({ aceptado: 0 }),
    ]);
    expect(sinPrecio.fuente).toBe("tarifa_fija");
  });

  it("el último pagado de cualquier OT, con el modelo escrito distinto", () => {
    const historico = [
      pagado({ modelo: "MS-01", aceptado: 100, fecha: "2026-08-01", ot: "102-24" }),
      pagado({ modelo: "ms 01", aceptado: 120, fecha: "2026-09-15", ot: "033-25" }),
      pagado({ modelo: "MS-01", aceptado: 999, fecha: "2026-09-20", estado: "revisado" }),
    ];
    expect(precedenteDe("MS.01", historico)?.aceptado).toBe(120);
  });

  it("con variante, nunca usa el precio de otra variante del mismo código", () => {
    const historico = [
      pagado({ modelo: "MUEBLE", descripcionPm: "CAMA KING", aceptado: 900, fecha: "2026-09-01" }),
      pagado({ modelo: "MUEBLE", descripcionPm: "MACETA METALICA BAÑO", aceptado: 150, fecha: "2026-08-01" }),
    ];
    expect(precedenteDe("MUEBLE", historico, undefined, undefined, "Cama  king")?.aceptado).toBe(900);
    expect(precedenteDe("MUEBLE", historico, undefined, undefined, "maceta metálica baño")?.aceptado).toBe(150);
    expect(precedenteDe("MUEBLE", historico, undefined, undefined, "CAMA QUEEN")).toBeNull();
    // Un antecedente sin variante (recibo anterior) sirve si no hay de la misma.
    const conAnterior = [...historico, pagado({ modelo: "MUEBLE", aceptado: 500, fecha: "2026-01-01" })];
    expect(precedenteDe("MUEBLE", conAnterior, undefined, undefined, "CAMA QUEEN")?.aceptado).toBe(500);
  });
});
