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

  it("resuelve por precedente ajustando por volumen y prioridad", () => {
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
    // 300 × (0.70 de "4 a 10" / 1.00 de "1 pieza") × 1.30 urgente
    expect(res.pu).toBe(273);
  });
});
