// Lista de pedidos agrupada por Orden de Trabajo, compartida por los paneles
// de Pedidos de Planeación y de Producción.

export interface PedidoConOt {
  id: string;
  numero_pedido: string;
  // "134-26" para 1PM134-26, 2PM134-26... (columna generada); agrupa los PM.
  orden_trabajo: string | null;
  fecha_pedido: string | null;
  fecha_entrega: string | null;
  created_at: string;
  proyectos: { nombre: string; cliente: string } | null;
}

// Una fila de la lista: una O.T. con sus PM, o un PM suelto (sin O.T.
// reconocible en su número).
export interface FilaOrdenTrabajo<P extends PedidoConOt = PedidoConOt> {
  ot: string | null;
  pedidos: P[];
}

// Agrupa los PM por O.T. conservando el orden de la lista (la O.T. aparece
// donde está su PM más reciente).
export function agruparPorOrdenTrabajo<P extends PedidoConOt>(pedidos: P[]): FilaOrdenTrabajo<P>[] {
  const filas: FilaOrdenTrabajo<P>[] = [];
  const porOt = new Map<string, P[]>();
  for (const p of pedidos) {
    if (!p.orden_trabajo) {
      filas.push({ ot: null, pedidos: [p] });
      continue;
    }
    let lista = porOt.get(p.orden_trabajo);
    if (!lista) {
      lista = [];
      porOt.set(p.orden_trabajo, lista);
      filas.push({ ot: p.orden_trabajo, pedidos: lista });
    }
    lista.push(p);
  }
  return filas;
}

// Año de un PM: el sufijo de su O.T. ("134-26" → 2026); si no tiene O.T.,
// el de la fecha del pedido o, en último caso, el de la carga.
export function anioDePedido(p: PedidoConOt): number {
  const sufijo = p.orden_trabajo?.match(/-(\d{2})$/);
  if (sufijo) return 2000 + Number(sufijo[1]);
  return Number((p.fecha_pedido ?? p.created_at).slice(0, 4));
}

// La búsqueda de O.T. compara contra el número de O.T., los números de PM,
// el proyecto y el cliente.
export function coincideBusquedaOt(fila: FilaOrdenTrabajo, texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    (fila.ot ?? "").toLowerCase().includes(t) ||
    fila.pedidos.some(
      (p) =>
        p.numero_pedido.toLowerCase().includes(t) ||
        (p.proyectos?.nombre ?? "").toLowerCase().includes(t) ||
        (p.proyectos?.cliente ?? "").toLowerCase().includes(t)
    )
  );
}

// Última fecha de entrega entre los PM de la O.T.
export function ultimaEntrega(pedidos: PedidoConOt[]): string | null {
  const fechas = pedidos.map((p) => p.fecha_entrega).filter((f): f is string => !!f);
  return fechas.length ? fechas.sort().at(-1)! : null;
}

// Cliente del PM tal como se compara en el filtro (sin espacios de más y
// en mayúsculas: el mismo cliente viene escrito distinto entre archivos).
export function clienteDe(p: PedidoConOt): string | null {
  const c = p.proyectos?.cliente?.replace(/\s+/g, " ").trim().toUpperCase();
  return c || null;
}

// Arma el href de la lista conservando los demás filtros.
export function hrefListaPedidos(
  base: string,
  params: { q?: string; anio?: string; cliente?: string }
): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.anio) qs.set("anio", params.anio);
  if (params.cliente) qs.set("cliente", params.cliente);
  const texto = qs.toString();
  return texto ? `${base}?${texto}` : base;
}

// Filtros de año y cliente + búsqueda de O.T. aplicados a la lista completa.
export function filtrarOrdenesTrabajo<P extends PedidoConOt>(
  pedidos: P[],
  filtros: { anio: number | null; cliente: string; busqueda: string }
): {
  filas: FilaOrdenTrabajo<P>[];
  aniosDisponibles: number[];
  clientesDisponibles: string[];
} {
  const aniosDisponibles = [...new Set(pedidos.map(anioDePedido))].sort((a, b) => b - a);
  const clientesDisponibles = [
    ...new Set(pedidos.map(clienteDe).filter((c): c is string => !!c)),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const filas = agruparPorOrdenTrabajo(
    pedidos.filter(
      (p) =>
        (!filtros.anio || anioDePedido(p) === filtros.anio) &&
        (!filtros.cliente || clienteDe(p) === filtros.cliente)
    )
  ).filter((fila) => !filtros.busqueda || coincideBusquedaOt(fila, filtros.busqueda));
  return { filas, aniosDisponibles, clientesDisponibles };
}
