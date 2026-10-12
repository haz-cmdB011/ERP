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
  descripcion: string;
  material: string | null;
  unidad: string | null;
  // Piezas que lleva un solo mueble.
  piezas_por_mueble: number;
  // Componente del PM de donde salió la línea; null si la agregó el trabajador.
  hijo_id: string | null;
}

export interface SugerenciaDespiece {
  lineas: LineaDespiece[];
  // Qué revisar en cada línea (mismo orden que `lineas`); null si nada.
  avisosPorLinea: (string | null)[];
  // Avisos del mueble completo.
  avisos: string[];
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

// Piezas de una línea para todos los muebles del padre.
export function totalLinea(piezasPorMueble: number, muebles: number): number {
  return redondear(piezasPorMueble * muebles);
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

  const vigentes = hijos
    .filter((h) => !h.eliminacion_solicitada_en && h.estado_revision !== "cancelado")
    .sort(
      (a, b) =>
        Number(a.item_code) - Number(b.item_code) ||
        (a.fila_excel_origen ?? 0) - (b.fila_excel_origen ?? 0)
    );

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
      piezas = 1;
      notas.push("El Excel no trae la cantidad; se puso 1, revísala.");
    } else if (porMueble > 0 && total > 0 && muebles > 0 && Math.abs(total - piezas * muebles) >= 0.01) {
      notas.push(
        `En el Excel suma ${total} en total, pero ${piezas} por mueble × ${muebles} = ${redondear(piezas * muebles)}.`
      );
    }
    if (!descripcion) notas.push("Sin descripción en el Excel.");

    const clave = `${sinAcentos(descripcion).toLowerCase()}|${sinAcentos(h.modelo ?? "").toLowerCase()}|${(h.unidad ?? "").toLowerCase()}`;
    if (descripcion) {
      const anterior = primeroConDescripcion.get(clave);
      if (anterior !== undefined) notas.push(`Se repite: es igual al componente ${anterior}.`);
      else primeroConDescripcion.set(clave, Number(h.item_code));
    }

    lineas.push({
      descripcion: descripcion || `Componente ${h.item_code}`,
      material: etiquetaMaterial(h.tipo_material),
      unidad: (h.unidad ?? "").trim().slice(0, MAX_UNIDAD) || null,
      piezas_por_mueble: piezas,
      hijo_id: h.id,
    });
    avisosPorLinea.push(notas.length > 0 ? notas.join(" ") : null);
  }

  if (lineas.length > MAX_LINEAS) {
    avisos.push(`El mueble tiene más de ${MAX_LINEAS} componentes; la sugerencia se cortó en ${MAX_LINEAS}.`);
    lineas.length = MAX_LINEAS;
    avisosPorLinea.length = MAX_LINEAS;
  }

  if (lineas.length === 0) {
    avisos.push("Este mueble no tiene componentes en el PM: se propone una sola línea con el mueble completo.");
    lineas.push({
      descripcion: primeraLinea(padre.descripcion) || (padre.modelo ?? "").trim() || `Ítem ${padre.item_code}`,
      material: etiquetaMaterial(padre.tipo_material),
      unidad: (padre.unidad ?? "").trim().slice(0, MAX_UNIDAD) || null,
      piezas_por_mueble: 1,
      hijo_id: null,
    });
    avisosPorLinea.push(null);
  }

  return { lineas, avisosPorLinea, avisos };
}

// Pasa el despiece como lo guarda la base: textos sin espacios de más y
// cantidades a dos decimales. Mismo criterio que guardar_despiece_produccion.
export function limpiarLineas(lineas: LineaDespiece[]): LineaDespiece[] {
  return lineas.map((l) => ({
    descripcion: l.descripcion.replace(/\s+/g, " ").trim(),
    material: l.material?.replace(/\s+/g, " ").trim() || null,
    unidad: l.unidad?.replace(/\s+/g, " ").trim() || null,
    piezas_por_mueble: redondear(Number(l.piezas_por_mueble)),
    hijo_id: l.hijo_id,
  }));
}

// Primer problema del despiece (para avisar antes de guardar), o null si está
// bien. La base vuelve a validar lo mismo.
export function validarLineas(lineas: LineaDespiece[]): string | null {
  if (lineas.length === 0) return "El despiece necesita al menos una línea.";
  if (lineas.length > MAX_LINEAS) return `El despiece no puede pasar de ${MAX_LINEAS} líneas.`;
  for (const [i, l] of limpiarLineas(lineas).entries()) {
    const n = i + 1;
    if (!l.descripcion) return `Línea ${n}: escribe la descripción.`;
    if (l.descripcion.length > MAX_DESCRIPCION) return `Línea ${n}: la descripción es muy larga.`;
    if ((l.material?.length ?? 0) > MAX_MATERIAL) return `Línea ${n}: el material es muy largo.`;
    if ((l.unidad?.length ?? 0) > MAX_UNIDAD) return `Línea ${n}: la unidad es muy larga.`;
    if (!Number.isFinite(l.piezas_por_mueble) || l.piezas_por_mueble <= 0) {
      return `Línea ${n}: la cantidad por mueble debe ser mayor que cero.`;
    }
    if (l.piezas_por_mueble > MAX_PIEZAS) return `Línea ${n}: la cantidad por mueble es demasiado grande.`;
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
      descripcion: texto(l.descripcion) ?? "",
      material: texto(l.material),
      unidad: texto(l.unidad),
      piezas_por_mueble: Number(l.piezas_por_mueble) || 0,
      hijo_id: texto(l.hijo_id),
    });
  }
  return lineas;
}
