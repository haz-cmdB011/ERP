// Catálogo de las fases de taller que puede recorrer un ítem del PM. Por ahora
// no se leen del Excel (ver parser.ts): no tienen un papel importante en el
// sistema todavía.
export const FASES_TALLER_COLUMNS = [
  "HAB MAD",
  "HAB MET",
  "ENS MAD",
  "ENS MET",
  "ACAB MAD",
  "ACAB MET",
  "TAPIZ",
  "EMPAQUE",
  "PT",
] as const;

export type FaseTaller = (typeof FASES_TALLER_COLUMNS)[number];
