// Carrito de Producción: los ítems (muebles padre y componentes) que se van
// juntando de cualquier PM u O.T. para llevarlos juntos al flujo de asignación
// a equipos de maquila. Sin navegador ni base de datos, para poder probarlo.
// Lo que se guarda es solo lo necesario para pintar y agrupar; el estado real
// (liberado, lo que falta por asignar) se pide a la base al abrir el carrito.

export interface ItemCarrito {
  id: string;
  tipo: "MO" | "FU";
  itemCode: number;
  modelo: string | null;
  descripcion: string | null;
  cantidad: number;
  unidad: string | null;
  // Del mueble padre al que pertenece (null en un MO).
  padreId: string | null;
  pedidoId: string;
  numeroPm: string;
  // O.T. del PM ("134-26"); null si el pedido no la tiene.
  ot: string | null;
}

export interface GrupoPm {
  pedidoId: string;
  numeroPm: string;
  items: ItemCarrito[];
}

export interface GrupoOt {
  ot: string | null;
  pms: GrupoPm[];
  total: number;
}

// Tope para no llenar el almacenamiento del aparato con un carrito olvidado.
export const MAX_ITEMS_CARRITO = 500;

// Agrega los ítems que no estén ya (un ítem solo entra una vez). Respeta el tope.
export function agregarAlCarrito(actual: ItemCarrito[], nuevos: ItemCarrito[]): ItemCarrito[] {
  const ya = new Set(actual.map((i) => i.id));
  const resultado = [...actual];
  for (const n of nuevos) {
    if (ya.has(n.id) || resultado.length >= MAX_ITEMS_CARRITO) continue;
    ya.add(n.id);
    resultado.push(n);
  }
  return resultado;
}

// Quita los ítems indicados. Quitar un mueble padre no quita sus componentes:
// cada uno se agrega y se quita por separado.
export function quitarDelCarrito(actual: ItemCarrito[], ids: Iterable<string>): ItemCarrito[] {
  const fuera = new Set(ids);
  return actual.filter((i) => !fuera.has(i.id));
}

// O.T. -> PM -> ítems. Dentro de cada PM, cada mueble va seguido de sus
// componentes (los componentes sin su mueble en el carrito van al final).
// Orden: O.T. y PM con números en orden natural; las sin O.T. al final.
export function agruparCarrito(items: ItemCarrito[]): GrupoOt[] {
  const porOt = new Map<string, Map<string, GrupoPm>>();
  for (const i of items) {
    const claveOt = i.ot ?? "";
    const pms = porOt.get(claveOt) ?? new Map<string, GrupoPm>();
    const pm = pms.get(i.pedidoId) ?? { pedidoId: i.pedidoId, numeroPm: i.numeroPm, items: [] };
    pm.items.push(i);
    pms.set(i.pedidoId, pm);
    porOt.set(claveOt, pms);
  }
  const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
  return [...porOt.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : natural(a, b)))
    .map(([ot, pms]) => {
      const lista = [...pms.values()]
        .sort((a, b) => natural(a.numeroPm, b.numeroPm))
        .map((pm) => ({ ...pm, items: ordenarMueblesYComponentes(pm.items) }));
      return {
        ot: ot === "" ? null : ot,
        pms: lista,
        total: lista.reduce((n, pm) => n + pm.items.length, 0),
      };
    });
}

function ordenarMueblesYComponentes(items: ItemCarrito[]): ItemCarrito[] {
  const padres = items.filter((i) => i.tipo === "MO").sort((a, b) => a.itemCode - b.itemCode);
  const idsPadres = new Set(padres.map((p) => p.id));
  const resultado: ItemCarrito[] = [];
  for (const p of padres) {
    resultado.push(p);
    resultado.push(
      ...items.filter((i) => i.tipo === "FU" && i.padreId === p.id).sort((a, b) => a.itemCode - b.itemCode)
    );
  }
  resultado.push(
    ...items
      .filter((i) => i.tipo === "FU" && !(i.padreId && idsPadres.has(i.padreId)))
      .sort((a, b) => a.itemCode - b.itemCode)
  );
  return resultado;
}

// Valida lo leído del almacenamiento del aparato: cualquier cosa rara se descarta.
export function leerCarrito(crudo: string | null): ItemCarrito[] {
  if (!crudo) return [];
  try {
    const dato: unknown = JSON.parse(crudo);
    if (!Array.isArray(dato)) return [];
    return dato.filter(
      (i): i is ItemCarrito =>
        !!i &&
        typeof i === "object" &&
        typeof i.id === "string" &&
        (i.tipo === "MO" || i.tipo === "FU") &&
        typeof i.itemCode === "number" &&
        typeof i.pedidoId === "string" &&
        typeof i.numeroPm === "string" &&
        (i.ot === null || typeof i.ot === "string")
    );
  } catch {
    return [];
  }
}
