// Despiece de un mueble (ítem padre) en Producción.
//
// El trabajador despieza el mueble como le sirva en el taller; antes de que lo
// haga, el sistema le propone un despiece armado con los componentes (ítems
// hijo) que Planeación puso en el PM. La sugerencia nunca se guarda sola: es
// solo el punto de partida. Lo que guarda el trabajador queda en
// despieces_produccion (ver la migración despiece_produccion) y no cambia el PM
// ni los recibos.
//
// Cada línea dice cuántas piezas lleva UN mueble; para varios muebles se
// multiplica por la cantidad del padre (totalLinea).

export interface PadreDespiece {
  id: string;
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
  tipo_material: string | null;
  unidad: string | null;
  cantidad_total: number;
}

export interface HijoDespiece {
  id: string;
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
  tipo_material: string | null;
  unidad: string | null;
  cantidad_x_mueble: number | null;
  cantidad_total: number;
  fila_excel_origen: number | null;
  eliminacion_solicitada_en: string | null;
  estado_revision: string | null;
}

export interface LineaDespiece {
  // Id de la parte (partes_despiece) que es esta línea; null u omitido en una línea
  // nueva (la base le da uno al guardar). Con él, la parte conserva sus asignaciones.
  id?: string | null;
  descripcion: string;
  material: string | null;
  unidad: string | null;
  // Piezas que lleva un solo mueble.
  piezas_por_mueble: number;
  // Cuánto del mueble vale la parte (0–100; todas las líneas suman 100). No se captura:
  // el editor lo reparte en partes iguales al guardar. Con él, el panel de asignación da
  // el avance del mueble por parte. null u omitido: despieces guardados antes del %.
  porcentaje?: number | null;
  // Componente del PM de donde salió la línea; null si la agregó el trabajador.
  hijo_id: string | null;
}

export interface SugerenciaDespiece {
  lineas: LineaDespiece[];
  // Qué revisar en cada línea (mismo orden que `lineas`); null si nada.
  avisosPorLinea: (string | null)[];
  // Avisos del mueble completo.
  avisos: string[];
  // true si había más componentes de los que caben y la sugerencia quedó incompleta.
  cortada: boolean;
}

// Mismos límites que valida la base (guardar_despiece_produccion).
export const MAX_LINEAS = 200;
export const MAX_DESCRIPCION = 300;
export const MAX_MATERIAL = 60;
export const MAX_UNIDAD = 30;
export const MAX_PIEZAS = 100000;

function redondear(n: number): number {
  // EPSILON: 1.005 debe dar 1.01 como en la base, no 1.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// El 100 % repartido en partes iguales a dos decimales; lo que sobra del redondeo va
// en la última para que sumen 100 exacto.
export function repartirPorcentajes(n: number): number[] {
  if (n <= 0) return [];
  const cada = Math.floor((100 / n) * 100) / 100;
  const lista = Array.from({ length: n }, () => cada);
  lista[n - 1] = redondear(100 - cada * (n - 1));
  return lista;
}

// Suma de los porcentajes, a dos decimales.
export function sumaPorcentajes(lineas: { porcentaje?: number | null }[]): number {
  return redondear(lineas.reduce((s, l) => s + (Number(l.porcentaje) || 0), 0));
}

function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Primera línea con texto, con los espacios colapsados: las descripciones del
// Excel a veces traen varias líneas.
function primeraLinea(texto: string | null | undefined): string {
  const linea =
    (texto ?? "")
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .find((l) => l.length > 0) ?? "";
  return linea.slice(0, MAX_DESCRIPCION);
}

const MATERIALES: Record<string, string> = {
  MADERA: "Madera",
  METAL: "Metal",
  HIBRIDO: "Híbrido",
  VIDRIO: "Vidrio",
  CRISTAL: "Cristal",
  PIEDRA: "Piedra",
  TAPIZ: "Tapiz",
  ESPEJO: "Espejo",
  "S.S.": "Superficie sólida",
  SS: "Superficie sólida",
};

// Para el campo de material del despiece (el texto es libre).
export const MATERIALES_SUGERIDOS = [...new Set(Object.values(MATERIALES))];

// "S.S." es la superficie sólida; "METAL" y "metal" son el mismo material.
export function etiquetaMaterial(crudo: string | null | undefined): string | null {
  const texto = (crudo ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return null;
  const conocido = MATERIALES[sinAcentos(texto).toUpperCase()];
  if (conocido) return conocido;
  const t = texto.slice(0, MAX_MATERIAL);
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function materialEscrito(crudo: string | null | undefined): string | null {
  const texto = (crudo ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return null;
  return MATERIALES[sinAcentos(texto).toUpperCase()] ?? texto;
}

// Formas en que se suele escribir cada unidad, para que "pza", "Pzas." y "pieza"
// cuenten como lo mismo (el campo sigue siendo libre).
const SINONIMOS_UNIDAD: Record<string, string> = {
  PZA: "PZA",
  PZAS: "PZA",
  PZ: "PZA",
  PZS: "PZA",
  PIEZA: "PZA",
  PIEZAS: "PZA",
  JGO: "JUEGO",
  JGOS: "JUEGO",
  JUEGO: "JUEGO",
  JUEGOS: "JUEGO",
  MT: "M",
  MTS: "M",
  MTO: "M",
  METRO: "M",
  METROS: "M",
  ML: "ML",
  M2: "M2",
  "M²": "M2",
  MT2: "M2",
  MTS2: "M2",
  KG: "KG",
  KGS: "KG",
  KILO: "KG",
  KILOS: "KG",
  LT: "LT",
  LTS: "LT",
  LITRO: "LT",
  LITROS: "LT",
  LOTE: "LOTE",
  ROLLO: "ROLLO",
  HOJA: "HOJA",
  HOJAS: "HOJA",
};

export const UNIDADES_SUGERIDAS = [...new Set(Object.values(SINONIMOS_UNIDAD))];

// Unidad en mayúsculas y con su forma habitual ("pzas." -> "PZA"); lo que no
// conoce lo deja en mayúsculas, como la base.
export function etiquetaUnidad(crudo: string | null | undefined): string | null {
  const texto = (crudo ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return null;
  const clave = sinAcentos(texto).toUpperCase().replace(/\./g, "");
  return (SINONIMOS_UNIDAD[clave] ?? texto.toUpperCase()).slice(0, MAX_UNIDAD);
}

// Piezas de una línea para todos los muebles del padre.
export function totalLinea(piezasPorMueble: number, muebles: number): number {
  return redondear(piezasPorMueble * muebles);
}

// Componentes que cuentan (sin los cancelados ni los enviados a la papelera),
// en el orden del Excel.
export function hijosVigentes<T extends HijoDespiece>(hijos: T[]): T[] {
  return hijos
    .filter((h) => !h.eliminacion_solicitada_en && h.estado_revision !== "cancelado")
    .sort(
      (a, b) =>
        Number(a.item_code) - Number(b.item_code) ||
        (a.fila_excel_origen ?? 0) - (b.fila_excel_origen ?? 0)
    );
}

// Arma la sugerencia con los componentes (hijos) del mueble. Una línea por
// componente vigente, en el orden del Excel; no junta ni oculta nada salvo las
// filas vacías. Lo dudoso se marca para que el trabajador lo revise.
export function sugerirDespiece(padre: PadreDespiece, hijos: HijoDespiece[]): SugerenciaDespiece {
  const muebles = Number(padre.cantidad_total) || 0;
  const avisos: string[] = [];
  if (muebles <= 0) {
    avisos.push("El PM no trae la cantidad de este mueble (o es 0): los totales saldrán en 0.");
  }

  const vigentes = hijosVigentes(hijos);

  const lineas: LineaDespiece[] = [];
  const avisosPorLinea: (string | null)[] = [];
  const primeroConDescripcion = new Map<string, number>();

  for (const h of vigentes) {
    const descripcion = primeraLinea(h.descripcion);
    const porMueble = Number(h.cantidad_x_mueble) || 0;
    const total = Number(h.cantidad_total) || 0;
    // Fila vacía del Excel: ni descripción ni cantidad.
    if (!descripcion && porMueble <= 0 && total <= 0) continue;

    const notas: string[] = [];
    let piezas = 0;
    if (porMueble > 0) {
      piezas = redondear(porMueble);
    } else if (muebles > 0 && total > 0) {
      piezas = redondear(total / muebles);
      notas.push("El Excel no trae la cantidad por mueble; se calculó con el total.");
    }
    if (!(piezas > 0)) {
      // No se inventa una cantidad: queda en blanco y hay que escribirla.
      piezas = 0;
      notas.push("El Excel no trae la cantidad; escríbela.");
    } else if (porMueble > 0 && total > 0 && muebles > 0 && Math.abs(total - piezas * muebles) >= 0.01) {
      notas.push(
        `En el Excel suma ${total} en total, pero ${piezas} por mueble × ${muebles} = ${redondear(piezas * muebles)}.`
      );
    }
    if (!descripcion) notas.push("Sin descripción en el Excel.");

    const clave = `${sinAcentos(descripcion).toLowerCase()}|${sinAcentos(h.modelo ?? "").toLowerCase()}|${etiquetaUnidad(h.unidad) ?? ""}`;
    if (descripcion) {
      const anterior = primeroConDescripcion.get(clave);
      if (anterior !== undefined) notas.push(`Se repite: es igual al componente ${anterior}.`);
      else primeroConDescripcion.set(clave, Number(h.item_code));
    }

    lineas.push({
      descripcion: descripcion || `Componente ${h.item_code}`,
      material: etiquetaMaterial(h.tipo_material),
      unidad: etiquetaUnidad(h.unidad),
      piezas_por_mueble: piezas,
      hijo_id: h.id,
    });
    avisosPorLinea.push(notas.length > 0 ? notas.join(" ") : null);
  }

  const cortada = lineas.length > MAX_LINEAS;
  if (cortada) {
    avisos.push(`El mueble tiene más de ${MAX_LINEAS} componentes; la sugerencia se cortó en ${MAX_LINEAS}.`);
    lineas.length = MAX_LINEAS;
    avisosPorLinea.length = MAX_LINEAS;
  }

  if (lineas.length === 0) {
    avisos.push("Este mueble no tiene componentes en el PM: se propone una sola línea con el mueble completo.");
    lineas.push({
      descripcion: primeraLinea(padre.descripcion) || (padre.modelo ?? "").trim() || `Ítem ${padre.item_code}`,
      material: etiquetaMaterial(padre.tipo_material),
      unidad: etiquetaUnidad(padre.unidad),
      piezas_por_mueble: 1,
      hijo_id: null,
    });
    avisosPorLinea.push(null);
  }

  // Las partes sugeridas valen lo mismo; el trabajador ajusta el % al revisar.
  repartirPorcentajes(lineas.length).forEach((p, i) => (lineas[i].porcentaje = p));
  return { lineas, avisosPorLinea, avisos, cortada };
}

// Pasa el despiece como lo guarda la base: textos sin espacios de más y
// cantidades a dos decimales. Mismo criterio que guardar_despiece_produccion.
export function limpiarLineas(lineas: LineaDespiece[]): LineaDespiece[] {
  return lineas.map((l) => ({
    id: l.id ?? null,
    descripcion: l.descripcion.replace(/\s+/g, " ").trim(),
    // Lo que escribe la persona se respeta; solo los materiales conocidos se unifican.
    material: materialEscrito(l.material),
    unidad: etiquetaUnidad(l.unidad),
    piezas_por_mueble: redondear(Number(l.piezas_por_mueble)),
    porcentaje: l.porcentaje == null || Number.isNaN(Number(l.porcentaje)) ? null : redondear(Number(l.porcentaje)),
    hijo_id: l.hijo_id,
  }));
}

// Primer problema del despiece (para avisar antes de guardar), o null si está
// bien. La base vuelve a validar lo mismo.
export function validarLineas(lineas: LineaDespiece[]): string | null {
  if (lineas.length === 0) return "El despiece necesita al menos una línea.";
  if (lineas.length > MAX_LINEAS) return `El despiece no puede pasar de ${MAX_LINEAS} líneas.`;
  const hijosVistos = new Set<string>();
  const limpias = limpiarLineas(lineas);
  const conPorcentaje = limpias.filter((l) => l.porcentaje != null).length;
  for (const [i, l] of limpias.entries()) {
    const n = i + 1;
    if (!l.descripcion) return `Línea ${n}: escribe la descripción.`;
    if (l.descripcion.length > MAX_DESCRIPCION) return `Línea ${n}: la descripción es muy larga.`;
    if ((l.material?.length ?? 0) > MAX_MATERIAL) return `Línea ${n}: el material es muy largo.`;
    if ((l.unidad?.length ?? 0) > MAX_UNIDAD) return `Línea ${n}: la unidad es muy larga.`;
    if (!Number.isFinite(l.piezas_por_mueble) || l.piezas_por_mueble <= 0) {
      return `Línea ${n}: la cantidad por mueble debe ser mayor que cero.`;
    }
    if (l.piezas_por_mueble > MAX_PIEZAS) return `Línea ${n}: la cantidad por mueble es demasiado grande.`;
    if (l.porcentaje != null && (l.porcentaje < 0 || l.porcentaje > 100)) {
      return `Línea ${n}: el porcentaje debe estar entre 0 y 100.`;
    }
    if (l.hijo_id) {
      if (hijosVistos.has(l.hijo_id)) return `Línea ${n}: ese componente del PM ya está en otra línea.`;
      hijosVistos.add(l.hijo_id);
    }
  }
  if (conPorcentaje > 0 && conPorcentaje < limpias.length) {
    return "Pon el porcentaje en todas las líneas del despiece (o en ninguna).";
  }
  if (conPorcentaje > 0 && Math.abs(sumaPorcentajes(limpias) - 100) > 0.05) {
    return `Los porcentajes suman ${sumaPorcentajes(limpias)} %; deben sumar 100 %.`;
  }
  return null;
}

// ¿Son el mismo despiece? Sirve para saber si se guardó la sugerencia tal cual.
export function mismasLineas(a: LineaDespiece[], b: LineaDespiece[]): boolean {
  const x = limpiarLineas(a);
  const y = limpiarLineas(b);
  return (
    x.length === y.length &&
    x.every(
      (l, i) =>
        l.descripcion === y[i].descripcion &&
        l.material === y[i].material &&
        l.unidad === y[i].unidad &&
        l.piezas_por_mueble === y[i].piezas_por_mueble &&
        (l.porcentaje ?? null) === (y[i].porcentaje ?? null) &&
        l.hijo_id === y[i].hijo_id
    )
  );
}

// Texto de un campo numérico ("1,5" o "1.5") a número; NaN si no es un número.
export function leerCantidad(texto: string): number {
  const t = texto.trim().replace(",", ".");
  return t === "" ? Number.NaN : Number(t);
}

// Lo guardado en la base (jsonb) a líneas, sin fiarse de su forma: lo que no
// sirve se descarta o se deja vacío para que la pantalla lo pida corregir.
export function lineasDesdeJson(valor: unknown): LineaDespiece[] {
  if (!Array.isArray(valor)) return [];
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const lineas: LineaDespiece[] = [];
  for (const crudo of valor) {
    if (!crudo || typeof crudo !== "object") continue;
    const l = crudo as Record<string, unknown>;
    lineas.push({
      id: texto(l.id),
      descripcion: texto(l.descripcion) ?? "",
      material: texto(l.material),
      unidad: texto(l.unidad),
      piezas_por_mueble: Number(l.piezas_por_mueble) || 0,
      porcentaje: l.porcentaje == null || l.porcentaje === "" || Number.isNaN(Number(l.porcentaje)) ? null : Number(l.porcentaje),
      hijo_id: texto(l.hijo_id),
    });
  }
  return lineas;
}

// --- Cambios del PM después de guardar ---------------------------------------
//
// Al guardar, la base toma una foto del PM (`base_pm` en despieces_produccion):
// la cantidad del mueble y sus componentes vigentes. Al abrir el despiece se
// compara con el PM de hoy para avisar si Planeación cambió algo.

export interface BasePm {
  muebles: number;
  hijos: {
    id: string;
    item_code: number;
    descripcion: string;
    cantidad_x_mueble: number | null;
    cantidad_total: number;
  }[];
}

export function basePmDesdeJson(valor: unknown): BasePm | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Record<string, unknown>;
  if (!Array.isArray(v.hijos)) return null;
  const hijos: BasePm["hijos"] = [];
  for (const crudo of v.hijos) {
    if (!crudo || typeof crudo !== "object") continue;
    const h = crudo as Record<string, unknown>;
    if (typeof h.id !== "string") continue;
    hijos.push({
      id: h.id,
      item_code: Number(h.item_code) || 0,
      descripcion: typeof h.descripcion === "string" ? h.descripcion : "",
      cantidad_x_mueble: h.cantidad_x_mueble == null ? null : Number(h.cantidad_x_mueble) || 0,
      cantidad_total: Number(h.cantidad_total) || 0,
    });
  }
  return { muebles: Number(v.muebles) || 0, hijos };
}

function nombreHijo(h: { item_code: number; descripcion: string | null }): string {
  const d = primeraLinea(h.descripcion).slice(0, 60);
  return `${h.item_code}${d ? ` (${d})` : ""}`;
}

// Qué cambió en el PM desde que se guardó el despiece. Vacío si nada, o si el
// despiece es anterior a esta función y no tiene foto del PM.
export function diferenciasConPm(base: BasePm | null, padre: PadreDespiece, hijos: HijoDespiece[]): string[] {
  if (!base) return [];
  const difs: string[] = [];
  const muebles = Number(padre.cantidad_total) || 0;
  if (Math.abs(muebles - base.muebles) >= 0.005) {
    difs.push(`La cantidad del mueble pasó de ${base.muebles} a ${muebles} en el PM.`);
  }
  const antes = new Map(base.hijos.map((h) => [h.id, h]));
  const ahora = new Map(hijosVigentes(hijos).map((h) => [h.id, h]));
  for (const [id, h] of ahora) {
    const previo = antes.get(id);
    if (!previo) {
      difs.push(`Componente nuevo en el PM: ${nombreHijo(h)}.`);
      continue;
    }
    const x = h.cantidad_x_mueble == null ? null : Number(h.cantidad_x_mueble);
    if (
      (x ?? 0) !== (previo.cantidad_x_mueble ?? 0) ||
      Math.abs((Number(h.cantidad_total) || 0) - previo.cantidad_total) >= 0.005
    ) {
      difs.push(`Cambió la cantidad del componente ${nombreHijo(h)}.`);
    }
  }
  for (const [id, h] of antes) {
    if (!ahora.has(id)) difs.push(`El componente ${nombreHijo(h)} ya no está vigente en el PM.`);
  }
  return difs;
}

// Líneas ligadas a componentes que ya no están vigentes en el PM.
export function lineasConComponenteCaido(lineas: LineaDespiece[], hijos: HijoDespiece[]): number[] {
  const vigentes = new Set(hijosVigentes(hijos).map((h) => h.id));
  const caidas: number[] = [];
  lineas.forEach((l, i) => {
    if (l.hijo_id && !vigentes.has(l.hijo_id)) caidas.push(i);
  });
  return caidas;
}

// --- Despiece de una versión anterior del PM ----------------------------------
//
// Cuando Planeación sube una versión nueva del PM, los ítems son otros y el
// despiece de la versión anterior no se ve. Se ofrece como punto de partida
// (nunca se guarda solo): cada línea se vuelve a ligar al componente que tenga
// el mismo número de ítem; si no hay uno único, queda sin ligar.
export function trasladarLineas(
  lineas: LineaDespiece[],
  hijosAnteriores: { id: string; item_code: number }[],
  hijosNuevos: { id: string; item_code: number }[]
): LineaDespiece[] {
  const codigoAnterior = new Map(hijosAnteriores.map((h) => [h.id, Number(h.item_code)]));
  const nuevosPorCodigo = new Map<number, string[]>();
  for (const h of hijosNuevos) {
    const c = Number(h.item_code);
    nuevosPorCodigo.set(c, [...(nuevosPorCodigo.get(c) ?? []), h.id]);
  }
  const usados = new Set<string>();
  return lineas.map((l) => {
    let hijo: string | null = null;
    if (l.hijo_id) {
      const codigo = codigoAnterior.get(l.hijo_id);
      const candidatos = codigo === undefined ? [] : (nuevosPorCodigo.get(codigo) ?? []);
      if (candidatos.length === 1 && !usados.has(candidatos[0])) {
        hijo = candidatos[0];
        usados.add(hijo);
      }
    }
    return { ...l, hijo_id: hijo };
  });
}

// --- Historial -----------------------------------------------------------------

export interface VersionHistorial {
  version: number;
  guardadoEn: string;
  igualASugerencia: boolean;
  lineas: LineaDespiece[];
}
