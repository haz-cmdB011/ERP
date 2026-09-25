import type { createClient } from "@/lib/supabase/server";
import { getImagenesConGrandePorItem } from "@/lib/planeacion/imagenes";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Helpers puros (con tests)
// ---------------------------------------------------------------------------

// Sin distinguir mayúsculas ni acentos ("pergola" encuentra "PÉRGOLA").
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const MAX_TERMINOS = 5;

// "pérgola 455" -> ["pergola", "455"]. Todos los términos deben aparecer.
export function terminosDe(consulta: string): string[] {
  return normalizar(consulta)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TERMINOS);
}

export function coincideTodos(textoNormalizado: string, terminos: string[]): boolean {
  return terminos.every((t) => textoNormalizado.includes(t));
}

// Patrón para ilike de PostgREST que tolera acentos: la base no ignora acentos,
// así que cada letra que puede llevarlos (a, e, i, o, u, n/ñ) se vuelve el
// comodín de un carácter. Solo sirve para traer candidatos; el filtro exacto
// (sin acentos) se vuelve a aplicar en la aplicación. También se quitan los
// caracteres que rompen la sintaxis de .or() y los comodines de LIKE.
export function patronTolerante(terminoNormalizado: string): string {
  return terminoNormalizado
    .replace(/[,()"\\%_*]/g, "")
    .replace(/[aeioun]/g, "_");
}

// De varios términos, el que más ayuda a acotar en la base: el más largo.
export function terminoPrincipal(terminos: string[]): string | null {
  if (terminos.length === 0) return null;
  return [...terminos].sort((a, b) => b.length - a.length)[0];
}

export function divididoEnLotes<T>(elementos: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < elementos.length; i += tamano) lotes.push(elementos.slice(i, i + tamano));
  return lotes;
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export interface ItemBusqueda {
  id: string;
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
  tipo_material: string | null;
  cantidad_total: number;
  unidad: string | null;
  estadoLiberacion: "pendiente" | "enviado_a_produccion";
  folio: string | null;
  imagenUrl: string | null;
  imagenGrandeUrl: string | null;
  // El componente coincide con lo buscado (se resalta al desplegar).
  coincide: boolean;
}

export interface GrupoBusqueda {
  padre: ItemBusqueda;
  hijos: ItemBusqueda[];
  pedidoId: string;
  numeroPedido: string;
  proyecto: string | null;
  cliente: string | null;
  // El mueble apareció solo porque un hijo coincidió: se muestra ya desplegado.
  abrirPorBusqueda: boolean;
}

export interface ResultadoBusqueda {
  grupos: GrupoBusqueda[];
  totalGrupos: number;
  truncado: boolean;
}

interface PedidoEmbebido {
  id: string;
  numero_pedido: string;
  eliminado_en: string | null;
  cancelado_en: string | null;
  proyectos: { nombre: string; cliente: string } | null;
}

interface FilaItem {
  id: string;
  item_code: number;
  tipo_registro: "MO" | "FU";
  modelo: string | null;
  descripcion: string | null;
  tipo_material: string | null;
  cantidad_total: number;
  unidad: string | null;
  parent_item_id: string | null;
  estado_liberacion: "pendiente" | "enviado_a_produccion";
  estado_revision: string | null;
  eliminacion_solicitada_en: string | null;
  pedido_versiones: {
    es_version_activa: boolean;
    pedidos: PedidoEmbebido | PedidoEmbebido[] | null;
  } | null;
}

const SELECT_ITEM =
  "id, item_code, tipo_registro, modelo, descripcion, tipo_material, cantidad_total, unidad, parent_item_id, estado_liberacion, estado_revision, eliminacion_solicitada_en, pedido_versiones!inner ( es_version_activa, pedidos!inner ( id, numero_pedido, eliminado_en, cancelado_en, proyectos ( nombre, cliente ) ) )";

const MAX_CANDIDATOS = 300;
const MAX_GRUPOS = 40;
const LOTE = 60;

function pedidoDe(fila: FilaItem): PedidoEmbebido | null {
  const p = fila.pedido_versiones?.pedidos ?? null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

// Lo que Producción ve: pedidos no eliminados ni cancelados, y ítems que no
// están cancelados ni en la papelera (igual que la vista de un pedido).
function esVisible(fila: FilaItem): boolean {
  const pedido = pedidoDe(fila);
  return (
    !!pedido &&
    !pedido.cancelado_en &&
    !fila.eliminacion_solicitada_en &&
    fila.estado_revision !== "cancelado"
  );
}

// Consulta base: solo la versión activa de pedidos no eliminados.
function baseItems(supabase: Supabase) {
  return supabase
    .from("planeacion_items")
    .select(SELECT_ITEM)
    .eq("pedido_versiones.es_version_activa", true)
    .is("pedido_versiones.pedidos.eliminado_en", null)
    .is("eliminacion_solicitada_en", null);
}

async function itemsPorIds(supabase: Supabase, ids: string[]): Promise<FilaItem[]> {
  const resultado: FilaItem[] = [];
  for (const lote of divididoEnLotes(ids, LOTE)) {
    const { data } = await baseItems(supabase).in("id", lote).returns<FilaItem[]>();
    resultado.push(...(data ?? []));
  }
  return resultado;
}

async function folioPorItem(supabase: Supabase, ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const lote of divididoEnLotes(ids, LOTE)) {
    const { data } = await supabase
      .from("folios_produccion")
      .select("planeacion_item_id, folio")
      .in("planeacion_item_id", lote)
      .returns<{ planeacion_item_id: string; folio: string }[]>();
    for (const f of data ?? []) mapa.set(f.planeacion_item_id, f.folio);
  }
  return mapa;
}

function textoBuscable(fila: FilaItem, folio: string | undefined): string {
  return normalizar(
    [fila.item_code, fila.modelo, fila.descripcion, fila.tipo_material, folio]
      .filter((v) => v !== null && v !== undefined)
      .join(" ")
  );
}

// Busca muebles (ítems padre, MO) y modelos entre TODOS los pedidos activos. Un
// mueble aparece si él o alguno de sus componentes (FU) coincide con todo lo
// escrito (código, modelo, descripción, material o folio, sin acentos).
export async function buscarMuebles(supabase: Supabase, consulta: string): Promise<ResultadoBusqueda> {
  const terminos = terminosDe(consulta);
  const principal = terminoPrincipal(terminos);
  if (!principal) return { grupos: [], totalGrupos: 0, truncado: false };

  // 1) Candidatos: por texto/código en la base, y por folio.
  const patron = patronTolerante(principal);
  const filtros = [
    `modelo.ilike.%${patron}%`,
    `descripcion.ilike.%${patron}%`,
    `tipo_material.ilike.%${patron}%`,
  ];
  if (/^\d+(\.\d+)?$/.test(principal)) filtros.push(`item_code.eq.${principal}`);

  const { data: porTexto } = await baseItems(supabase)
    .or(filtros.join(","))
    .limit(MAX_CANDIDATOS)
    .returns<FilaItem[]>();
  const candidatos = new Map<string, FilaItem>((porTexto ?? []).map((f) => [f.id, f]));

  if (/\d|prd/.test(principal)) {
    const literal = principal.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: porFolio } = await supabase
      .from("folios_produccion")
      .select("planeacion_item_id")
      .ilike("folio", `%${literal}%`)
      .not("planeacion_item_id", "is", null)
      .limit(MAX_CANDIDATOS)
      .returns<{ planeacion_item_id: string }[]>();
    const idsFolio = (porFolio ?? [])
      .map((f) => f.planeacion_item_id)
      .filter((id) => !candidatos.has(id));
    for (const fila of await itemsPorIds(supabase, idsFolio)) candidatos.set(fila.id, fila);
  }

  // 2) Filtro exacto (todos los términos, sin acentos) sobre lo visible.
  const visibles = [...candidatos.values()].filter(esVisible);
  const folios = await folioPorItem(supabase, visibles.map((f) => f.id));
  const coinciden = visibles.filter((f) => coincideTodos(textoBuscable(f, folios.get(f.id)), terminos));
  const idsCoinciden = new Set(coinciden.map((f) => f.id));

  // 3) Agrupar por mueble padre (un FU cuelga de su MO; si no tiene, va solo).
  const conocidos = new Map<string, FilaItem>(visibles.map((f) => [f.id, f]));
  const idsPadresFaltantes = [
    ...new Set(
      coinciden
        .map((f) => f.parent_item_id)
        .filter((id): id is string => !!id && !conocidos.has(id))
    ),
  ];
  for (const fila of await itemsPorIds(supabase, idsPadresFaltantes)) {
    if (esVisible(fila)) conocidos.set(fila.id, fila);
  }

  const idPadreDe = (f: FilaItem): string =>
    f.tipo_registro === "FU" && f.parent_item_id && conocidos.has(f.parent_item_id)
      ? f.parent_item_id
      : f.id;

  const idsPadres = [...new Set(coinciden.map(idPadreDe))];
  const padresOrdenados = idsPadres
    .map((id) => conocidos.get(id) as FilaItem)
    .sort((a, b) => {
      const pa = pedidoDe(a)?.numero_pedido ?? "";
      const pb = pedidoDe(b)?.numero_pedido ?? "";
      return pa === pb ? Number(a.item_code) - Number(b.item_code) : pb.localeCompare(pa);
    });
  const totalGrupos = padresOrdenados.length;
  const padresMostrados = padresOrdenados.slice(0, MAX_GRUPOS);

  // 4) Todos los componentes de los muebles mostrados, para poder desplegarlos.
  const hijosPorPadre = new Map<string, FilaItem[]>();
  for (const lote of divididoEnLotes(
    padresMostrados.filter((p) => p.tipo_registro === "MO").map((p) => p.id),
    LOTE
  )) {
    const { data } = await baseItems(supabase)
      .in("parent_item_id", lote)
      .returns<FilaItem[]>();
    for (const hijo of (data ?? []).filter(esVisible)) {
      const padreId = hijo.parent_item_id as string;
      const lista = hijosPorPadre.get(padreId) ?? [];
      lista.push(hijo);
      hijosPorPadre.set(padreId, lista);
    }
  }

  // 5) Imágenes y folios de todo lo que se va a mostrar.
  const filasMostradas = padresMostrados.flatMap((p) => [p, ...(hijosPorPadre.get(p.id) ?? [])]);
  const idsMostrados = [...new Set(filasMostradas.map((f) => f.id))];
  const foliosMostrados = await folioPorItem(supabase, idsMostrados);
  const imagenes = new Map<string, { url: string; urlGrande: string | null }[]>();
  for (const lote of divididoEnLotes(idsMostrados, 100)) {
    for (const [id, lista] of await getImagenesConGrandePorItem(supabase, lote)) imagenes.set(id, lista);
  }

  const aItem = (f: FilaItem): ItemBusqueda => ({
    id: f.id,
    item_code: f.item_code,
    modelo: f.modelo,
    descripcion: f.descripcion,
    tipo_material: f.tipo_material,
    cantidad_total: f.cantidad_total,
    unidad: f.unidad,
    estadoLiberacion: f.estado_liberacion,
    folio: foliosMostrados.get(f.id) ?? null,
    imagenUrl: imagenes.get(f.id)?.[0]?.url ?? null,
    imagenGrandeUrl: imagenes.get(f.id)?.[0]?.urlGrande ?? null,
    coincide: idsCoinciden.has(f.id),
  });

  const grupos: GrupoBusqueda[] = padresMostrados.map((padre) => {
    const pedido = pedidoDe(padre) as PedidoEmbebido;
    const hijos = (hijosPorPadre.get(padre.id) ?? []).sort(
      (a, b) => Number(a.item_code) - Number(b.item_code)
    );
    return {
      padre: aItem(padre),
      hijos: hijos.map(aItem),
      pedidoId: pedido.id,
      numeroPedido: pedido.numero_pedido,
      proyecto: pedido.proyectos?.nombre ?? null,
      cliente: pedido.proyectos?.cliente ?? null,
      // El propio mueble no coincide (o coincide) pero sí un componente suyo.
      abrirPorBusqueda: !idsCoinciden.has(padre.id) && hijos.some((h) => idsCoinciden.has(h.id)),
    };
  });

  return { grupos, totalGrupos, truncado: totalGrupos > MAX_GRUPOS };
}
