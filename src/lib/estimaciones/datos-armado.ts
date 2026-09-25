// Catálogos de los recibos de ARMADO. Reutiliza familias, obras, OT, factores
// de volumen y prioridad de Acabados (datos-acabados.ts); aquí solo va lo que
// es propio del armado.

// La colocación de herrajes no es un tipo de armado: es una opción aparte
// (Sí / No) que se combina con cualquiera de estos.
export const TIPOS_ARMADO = ["Natural", "Laminado"] as const;
export type TipoArmado = (typeof TIPOS_ARMADO)[number];

// Armado arranca sin tarifas propias: las de Acabados (Zoclo $20, Puerta $700…)
// son de acabado y no aplican al armado. Mientras no se calibren, el precio
// sugerido sale solo de precedentes de armado (mismo modelo y tipo de armado);
// si no hay, el estimador lo fija y lo justifica. Cuando existan tarifas de
// armado se cargan aquí.
export const TARIFAS_FIJAS_ARMADO: Record<string, number> = {};
export const TARIFAS_BASE_ARMADO: Record<string, number> = {};
