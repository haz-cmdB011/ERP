// Filtros de la tabla de ítems de un PM en Planeación: texto (modelo), material
// y estado de revisión. Un mueble se muestra si él o alguno de sus componentes
// cumple todos los filtros a la vez; de los componentes se muestran todos si el
// mueble cumple, y solo los que cumplen si fue por un componente.

export type EstadoFiltro = "todos" | "en_revision" | "normal";

export interface FiltrosItems {
  // Ya en minúsculas y sin espacios en los extremos.
  texto: string;
  // Ya en mayúsculas (ver materialesDe); null = cualquiera.
  material: string | null;
  estado: EstadoFiltro;
}

export interface ItemFiltrable {
  tipo_material: string | null;
  modelo: string | null;
  estado_revision: "en_revision" | "cancelado" | null;
}

export interface MuebleFiltrable extends ItemFiltrable {
  hijos: ItemFiltrable[];
}

export function materialDe(item: ItemFiltrable): string {
  return (item.tipo_material ?? "").trim().toUpperCase();
}

export function cumpleFiltros(item: ItemFiltrable, f: FiltrosItems): boolean {
  if (f.texto && !(item.modelo ?? "").toLowerCase().includes(f.texto)) return false;
  if (f.material && materialDe(item) !== f.material) return false;
  if (f.estado === "en_revision" && item.estado_revision !== "en_revision") return false;
  if (f.estado === "normal" && item.estado_revision !== null) return false;
  return true;
}

export function hayFiltros(f: FiltrosItems): boolean {
  return !!(f.texto || f.material || f.estado !== "todos");
}

export function filtrarMuebles<M extends MuebleFiltrable>(
  muebles: M[],
  f: FiltrosItems
): { mueble: M; hijos: M["hijos"] }[] {
  if (!hayFiltros(f)) return muebles.map((m) => ({ mueble: m, hijos: m.hijos }));
  return muebles.flatMap((m) => {
    const cumpleMueble = cumpleFiltros(m, f);
    const hijosQueCumplen = m.hijos.filter((h) => cumpleFiltros(h, f));
    if (!cumpleMueble && hijosQueCumplen.length === 0) return [];
    return [{ mueble: m, hijos: cumpleMueble ? m.hijos : hijosQueCumplen }];
  });
}

// Muebles con algún componente que cumple los filtros: se abren solos al
// filtrar, para que lo encontrado quede a la vista.
export function padresConHijosCoincidentes(
  muebles: (MuebleFiltrable & { id: string })[],
  f: FiltrosItems
): Set<string> {
  if (!hayFiltros(f)) return new Set();
  return new Set(muebles.filter((m) => m.hijos.some((h) => cumpleFiltros(h, f))).map((m) => m.id));
}

// Materiales distintos del PM (en mayúsculas y ordenados), para los botones.
export function materialesDe(muebles: MuebleFiltrable[]): string[] {
  const materiales = new Set<string>();
  for (const m of muebles) {
    for (const item of [m, ...m.hijos]) {
      const material = materialDe(item);
      if (material) materiales.add(material);
    }
  }
  return [...materiales].sort((a, b) => a.localeCompare(b, "es"));
}

export function contarPorEstado(muebles: MuebleFiltrable[]): { enRevision: number; normales: number } {
  let enRevision = 0;
  let normales = 0;
  for (const m of muebles) {
    for (const item of [m, ...m.hijos]) {
      if (item.estado_revision === "en_revision") enRevision += 1;
      else if (item.estado_revision === null) normales += 1;
    }
  }
  return { enRevision, normales };
}
