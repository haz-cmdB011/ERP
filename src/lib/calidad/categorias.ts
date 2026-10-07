// Categorías del defecto en un informe "No aprobado". La misma lista vive en la
// restricción informes_calidad_categoria_check de la base (migración
// 20261007173153_validar_informes_calidad.sql): si cambia una, cambia la otra.

export const CATEGORIAS_DEFECTO = [
  { valor: "acabado", nombre: "Acabado" },
  { valor: "medidas", nombre: "Medidas" },
  { valor: "dano", nombre: "Daño" },
  { valor: "faltante", nombre: "Pieza faltante" },
  { valor: "material", nombre: "Material" },
  { valor: "armado", nombre: "Armado" },
  { valor: "otro", nombre: "Otro" },
] as const;

export type CategoriaDefecto = (typeof CATEGORIAS_DEFECTO)[number]["valor"];

export function esCategoriaDefecto(valor: string | null | undefined): valor is CategoriaDefecto {
  return CATEGORIAS_DEFECTO.some((c) => c.valor === valor);
}

export function nombreCategoria(valor: string | null | undefined): string | null {
  return CATEGORIAS_DEFECTO.find((c) => c.valor === valor)?.nombre ?? null;
}
