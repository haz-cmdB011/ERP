/**
 * Qué cambió entre dos versiones de un PM (ej. la "Actualización 22.09.26"
 * contra la anterior).
 *
 * Cada carga crea filas nuevas, así que un mismo mueble no conserva su id
 * entre versiones, y tampoco siempre su número de ítem (insertar un mueble
 * recorre los siguientes). Por eso se emparejan por contenido:
 *   - Muebles (MO, y componentes que no cuelgan de ningún mueble): por MODELO;
 *     entre varios con el mismo modelo, el de mismo número de ítem y
 *     ubicación. Si le cambiaron el modelo, por número de ítem cuando la
 *     descripción coincide (o uno de los dos no trae modelo).
 *   - Componentes (FU) de un mismo mueble: por tipo + descripción; si cambió
 *     el tipo, por descripción; si cambió la descripción, por su posición
 *     dentro del mueble (1.01, 1.02…) y tipo.
 * Lo que no se empareja es nuevo o quitado.
 *
 * Cambiar solo de número de ítem no cuenta como cambio (se informa aparte),
 * y una cantidad total de componente que cambió solo porque cambió la del
 * mueble se marca como derivada para no inflar el conteo.
 */

export interface ItemComparable {
  id: string;
  parentId: string | null;
  itemCode: number;
  tipoRegistro: "MO" | "FU";
  modelo: string | null;
  descripcion: string | null;
  tipoMaterial: string | null;
  etapa: string | null;
  nivel: string | null;
  departamento: string | null;
  elevacion: string | null;
  cantidadXMueble: number | null;
  unidad: string | null;
  cantidadTotal: number;
  acabados: string | null;
  observaciones: string | null;
  // Fila del Excel: orden de aparición.
  fila: number | null;
}

export type CampoComparado =
  | "modelo"
  | "descripcion"
  | "tipoMaterial"
  | "cantidadXMueble"
  | "unidad"
  | "cantidadTotal"
  | "acabados"
  | "observaciones"
  | "etapa"
  | "nivel"
  | "departamento"
  | "elevacion";

export const ETIQUETA_CAMPO: Record<CampoComparado, string> = {
  modelo: "Modelo",
  descripcion: "Descripción",
  tipoMaterial: "Tipo",
  cantidadXMueble: "Cantidad x mueble",
  unidad: "Unidad",
  cantidadTotal: "Cantidad total",
  acabados: "Acabados",
  observaciones: "Observaciones",
  etapa: "Etapa",
  nivel: "Nivel",
  departamento: "Departamento",
  elevacion: "Elevación",
};

export const CAMPOS_NUMERICOS: ReadonlySet<CampoComparado> = new Set([
  "cantidadXMueble",
  "cantidadTotal",
]);

// Los componentes repiten el modelo y la ubicación de su mueble: si esos
// cambian, ya se reporta en el mueble.
const CAMPOS_MUEBLE: CampoComparado[] = [
  "modelo",
  "descripcion",
  "tipoMaterial",
  "cantidadXMueble",
  "unidad",
  "cantidadTotal",
  "acabados",
  "observaciones",
  "etapa",
  "nivel",
  "departamento",
  "elevacion",
];
const CAMPOS_COMPONENTE: CampoComparado[] = [
  "descripcion",
  "tipoMaterial",
  "cantidadXMueble",
  "unidad",
  "cantidadTotal",
  "acabados",
  "observaciones",
];

export interface CambioCampo {
  campo: CampoComparado;
  antes: string | number | null;
  despues: string | number | null;
}

export type TipoCambio = "agregado" | "quitado" | "modificado";

export interface CambioComponente {
  tipo: TipoCambio;
  antes: ItemComparable | null;
  despues: ItemComparable | null;
  campos: CambioCampo[];
  // Solo cambió la cantidad total, y porque cambió la cantidad del mueble.
  derivado: boolean;
}

export interface CambioMueble {
  tipo: TipoCambio;
  antes: ItemComparable | null;
  despues: ItemComparable | null;
  campos: CambioCampo[];
  // En un mueble modificado, solo sus componentes con cambios; en uno nuevo
  // o quitado, todos sus componentes (como agregados o quitados).
  componentes: CambioComponente[];
  // Cambió de número de ítem (ej. por un mueble insertado antes).
  renumerado: boolean;
}

export interface ResumenCambios {
  mueblesAgregados: number;
  mueblesQuitados: number;
  mueblesModificados: number;
  mueblesSinCambios: number;
  // Solo en muebles que están en ambas versiones (los de un mueble nuevo o
  // quitado van con él).
  componentesAgregados: number;
  componentesQuitados: number;
  componentesModificados: number;
  // Muebles que solo cambiaron de número de ítem o además de otros cambios.
  renumerados: number;
}

export interface CambiosVersiones {
  cambios: CambioMueble[];
  resumen: ResumenCambios;
}

// Sin acentos, espacios de más ni diferencias de mayúsculas: "Pérgola  240"
// y "PERGOLA 240" no son un cambio.
export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function mismoNumero(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.005;
}

function mismoTexto(a: string | null, b: string | null): boolean {
  return normalizarTexto(a) === normalizarTexto(b);
}

function camposCambiados(
  antes: ItemComparable,
  despues: ItemComparable,
  campos: CampoComparado[]
): CambioCampo[] {
  const cambiados: CambioCampo[] = [];
  for (const campo of campos) {
    const a = antes[campo];
    const b = despues[campo];
    const igual = CAMPOS_NUMERICOS.has(campo)
      ? mismoNumero(a as number | null, b as number | null)
      : mismoTexto(a as string | null, b as string | null);
    if (!igual) cambiados.push({ campo, antes: a, despues: b });
  }
  return cambiados;
}

// Posición del componente dentro de su mueble: 3 para el ítem 12.03.
function posicionEnMueble(item: ItemComparable): number {
  return Math.round((item.itemCode - Math.floor(item.itemCode)) * 100);
}

interface Pasada {
  // Solo se emparejan elementos con la misma clave (null: no participa).
  clave: (x: ItemComparable) => string | null;
  compatibles?: (a: ItemComparable, b: ItemComparable) => boolean;
  // Condición extra cuando el grupo es ambiguo (más de un candidato de algún
  // lado): así un sobrante del grupo no se empareja con otro solo por
  // compartir la clave.
  compatiblesSiAmbiguo?: (a: ItemComparable, b: ItemComparable) => boolean;
}

// Empareja los elementos de dos listas pasada por pasada. Dentro de un grupo
// con la misma clave gana la pareja con más afinidad y, a igual afinidad, la
// de posición más parecida dentro del grupo (la 2.ª puerta de un modelo con
// la 2.ª): esa posición relativa no cambia cuando se inserta o quita algo en
// otra parte del PM, a diferencia del número de ítem.
function emparejar(
  antes: ItemComparable[],
  despues: ItemComparable[],
  pasadas: Pasada[],
  afinidad: (a: ItemComparable, b: ItemComparable) => number
): {
  pares: [ItemComparable, ItemComparable][];
  soloAntes: ItemComparable[];
  soloDespues: ItemComparable[];
} {
  const libresAntes = new Set(antes);
  const libresDespues = new Set(despues);
  const pares: [ItemComparable, ItemComparable][] = [];

  for (const pasada of pasadas) {
    const grupos = new Map<string, { a: ItemComparable[]; b: ItemComparable[] }>();
    const grupo = (k: string) => {
      let g = grupos.get(k);
      if (!g) {
        g = { a: [], b: [] };
        grupos.set(k, g);
      }
      return g;
    };
    for (const x of libresAntes) {
      const k = pasada.clave(x);
      if (k !== null) grupo(k).a.push(x);
    }
    for (const y of libresDespues) {
      const k = pasada.clave(y);
      if (k !== null) grupo(k).b.push(y);
    }

    for (const { a, b } of grupos.values()) {
      if (a.length === 0 || b.length === 0) continue;
      const ambiguo = a.length > 1 || b.length > 1;
      // a y b están en el orden de las listas: el índice es la posición
      // dentro del grupo.
      const candidatos: { x: ItemComparable; y: ItemComparable; afinidad: number; distancia: number; i: number }[] =
        [];
      a.forEach((x, i) => {
        b.forEach((y, j) => {
          if (pasada.compatibles && !pasada.compatibles(x, y)) return;
          if (ambiguo && pasada.compatiblesSiAmbiguo && !pasada.compatiblesSiAmbiguo(x, y)) return;
          candidatos.push({ x, y, afinidad: afinidad(x, y), distancia: Math.abs(i - j), i });
        });
      });
      candidatos.sort((p, q) => q.afinidad - p.afinidad || p.distancia - q.distancia || p.i - q.i);
      for (const c of candidatos) {
        if (libresAntes.has(c.x) && libresDespues.has(c.y)) {
          pares.push([c.x, c.y]);
          libresAntes.delete(c.x);
          libresDespues.delete(c.y);
        }
      }
    }
  }

  return {
    pares,
    soloAntes: antes.filter((x) => libresAntes.has(x)),
    soloDespues: despues.filter((y) => libresDespues.has(y)),
  };
}

const PASADAS_MUEBLE: Pasada[] = [
  // 1. Mismo modelo (y mismo tipo de registro: un componente suelto no es su
  //    mueble aunque repita el modelo). Con varios del mismo modelo, además
  //    deben compartir número de ítem, ubicación o descripción.
  {
    clave: (x) => {
      const modelo = normalizarTexto(x.modelo);
      return modelo ? `${x.tipoRegistro}:${modelo}` : null;
    },
    compatiblesSiAmbiguo: (a, b) =>
      mismoNumero(a.itemCode, b.itemCode) ||
      mismoTexto(a.departamento, b.departamento) ||
      mismoTexto(a.descripcion, b.descripcion),
  },
  // 2. Modelo renombrado o sin modelo: mismo número de ítem, si la
  //    descripción coincide o a alguno de los dos le falta el modelo.
  {
    clave: (x) => `${x.tipoRegistro}:${Math.round(x.itemCode * 100)}`,
    compatibles: (a, b) =>
      !normalizarTexto(a.modelo) ||
      !normalizarTexto(b.modelo) ||
      (normalizarTexto(a.descripcion) !== "" && mismoTexto(a.descripcion, b.descripcion)),
  },
];

// La ubicación identifica mejor a un mueble físico que su número de ítem, que
// se recorre cuando insertan o quitan otro.
function afinidadMueble(a: ItemComparable, b: ItemComparable): number {
  let puntos = 0;
  if (mismoTexto(a.departamento, b.departamento)) puntos += 3;
  if (mismoTexto(a.elevacion, b.elevacion)) puntos += 2;
  if (mismoNumero(a.itemCode, b.itemCode)) puntos += 2;
  if (mismoTexto(a.nivel, b.nivel)) puntos += 1;
  if (mismoTexto(a.etapa, b.etapa)) puntos += 1;
  if (mismoTexto(a.descripcion, b.descripcion)) puntos += 1;
  if (mismoNumero(a.cantidadTotal, b.cantidadTotal)) puntos += 1;
  if (mismoTexto(a.acabados, b.acabados)) puntos += 1;
  return puntos;
}

const PASADAS_COMPONENTE: Pasada[] = [
  // 1. Mismo tipo y descripción (aunque se haya recorrido de posición).
  { clave: (x) => `${normalizarTexto(x.tipoMaterial)}|${normalizarTexto(x.descripcion)}` },
  // 2. Cambió el tipo (ej. ACRILICO → S.S.) pero no la descripción.
  { clave: (x) => normalizarTexto(x.descripcion) || null },
  // 3. Descripción editada: misma posición en el mueble y mismo tipo.
  {
    clave: (x) => String(posicionEnMueble(x)),
    compatibles: (a, b) =>
      !normalizarTexto(a.tipoMaterial) ||
      !normalizarTexto(b.tipoMaterial) ||
      mismoTexto(a.tipoMaterial, b.tipoMaterial),
  },
];

function afinidadComponente(a: ItemComparable, b: ItemComparable): number {
  let puntos = 0;
  if (posicionEnMueble(a) === posicionEnMueble(b)) puntos += 2;
  if (mismoNumero(a.cantidadXMueble, b.cantidadXMueble)) puntos += 1;
  if (mismoTexto(a.acabados, b.acabados)) puntos += 1;
  return puntos;
}

function porOrden(a: ItemComparable, b: ItemComparable): number {
  return (a.fila ?? Infinity) - (b.fila ?? Infinity) || a.itemCode - b.itemCode;
}

// Muebles (y componentes sin mueble) con sus componentes, en orden del Excel.
function estructurar(items: ItemComparable[]): {
  superiores: ItemComparable[];
  hijos: Map<string, ItemComparable[]>;
} {
  const porId = new Map(items.map((i) => [i.id, i]));
  const superiores: ItemComparable[] = [];
  const hijos = new Map<string, ItemComparable[]>();
  for (const item of items) {
    const padre = item.parentId ? porId.get(item.parentId) : undefined;
    if (item.tipoRegistro === "FU" && padre?.tipoRegistro === "MO") {
      const lista = hijos.get(padre.id) ?? [];
      lista.push(item);
      hijos.set(padre.id, lista);
    } else {
      superiores.push(item);
    }
  }
  superiores.sort(porOrden);
  for (const lista of hijos.values()) lista.sort(porOrden);
  return { superiores, hijos };
}

function compararComponentes(
  antes: ItemComparable[],
  despues: ItemComparable[],
  cambioCantidadMueble: boolean
): CambioComponente[] {
  const { pares, soloAntes, soloDespues } = emparejar(
    antes,
    despues,
    PASADAS_COMPONENTE,
    afinidadComponente
  );
  const cambios: CambioComponente[] = [];
  for (const [a, b] of pares) {
    const campos = camposCambiados(a, b, CAMPOS_COMPONENTE);
    if (campos.length === 0) continue;
    const derivado =
      cambioCantidadMueble && campos.length === 1 && campos[0].campo === "cantidadTotal";
    cambios.push({ tipo: "modificado", antes: a, despues: b, campos, derivado });
  }
  for (const b of soloDespues) {
    cambios.push({ tipo: "agregado", antes: null, despues: b, campos: [], derivado: false });
  }
  for (const a of soloAntes) {
    cambios.push({ tipo: "quitado", antes: a, despues: null, campos: [], derivado: false });
  }
  return cambios.sort((x, y) => porOrden((x.despues ?? x.antes)!, (y.despues ?? y.antes)!));
}

export function compararVersiones(
  antes: ItemComparable[],
  despues: ItemComparable[]
): CambiosVersiones {
  const a = estructurar(antes);
  const b = estructurar(despues);
  const { pares, soloAntes, soloDespues } = emparejar(
    a.superiores,
    b.superiores,
    PASADAS_MUEBLE,
    afinidadMueble
  );

  const resumen: ResumenCambios = {
    mueblesAgregados: soloDespues.length,
    mueblesQuitados: soloAntes.length,
    mueblesModificados: 0,
    mueblesSinCambios: 0,
    componentesAgregados: 0,
    componentesQuitados: 0,
    componentesModificados: 0,
    renumerados: 0,
  };
  const cambios: CambioMueble[] = [];

  for (const [x, y] of pares) {
    const campos = camposCambiados(x, y, CAMPOS_MUEBLE);
    const componentes = compararComponentes(
      a.hijos.get(x.id) ?? [],
      b.hijos.get(y.id) ?? [],
      !mismoNumero(x.cantidadTotal, y.cantidadTotal)
    );
    for (const c of componentes) {
      if (c.tipo === "agregado") resumen.componentesAgregados++;
      else if (c.tipo === "quitado") resumen.componentesQuitados++;
      else if (!c.derivado) resumen.componentesModificados++;
    }
    const renumerado = !mismoNumero(x.itemCode, y.itemCode);
    if (renumerado) resumen.renumerados++;

    if (campos.length > 0 || componentes.length > 0) {
      resumen.mueblesModificados++;
      cambios.push({ tipo: "modificado", antes: x, despues: y, campos, componentes, renumerado });
    } else {
      resumen.mueblesSinCambios++;
    }
  }

  for (const y of soloDespues) {
    cambios.push({
      tipo: "agregado",
      antes: null,
      despues: y,
      campos: [],
      componentes: (b.hijos.get(y.id) ?? []).map((h) => ({
        tipo: "agregado" as const,
        antes: null,
        despues: h,
        campos: [],
        derivado: false,
      })),
      renumerado: false,
    });
  }
  for (const x of soloAntes) {
    cambios.push({
      tipo: "quitado",
      antes: x,
      despues: null,
      campos: [],
      componentes: (a.hijos.get(x.id) ?? []).map((h) => ({
        tipo: "quitado" as const,
        antes: h,
        despues: null,
        campos: [],
        derivado: false,
      })),
      renumerado: false,
    });
  }

  // En el orden de la versión nueva; los quitados, donde estaban.
  cambios.sort(
    (p, q) =>
      (p.despues ?? p.antes)!.itemCode - (q.despues ?? q.antes)!.itemCode ||
      Number(p.tipo === "quitado") - Number(q.tipo === "quitado")
  );
  return { cambios, resumen };
}
