// Fases de taller que puede recorrer un ítem del PM. Fuente única para el
// parser (qué columnas leer del Excel) y para la Hoja de Viajero (qué
// checklist mostrar) — evita que las dos listas se desincronicen.
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
