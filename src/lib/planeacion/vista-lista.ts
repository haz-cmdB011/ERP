// Cómo se ve la lista de Pedidos (Planeación y Producción) sin saturarla: por omisión solo las
// O.T. "activas", agrupadas en un desplegable por cliente. Buscar siempre muestra todo lo que coincide.

export type EstadoLista = "activos" | "terminados" | "todos";

export const ESTADOS_LISTA: { valor: EstadoLista; etiqueta: string }[] = [
  { valor: "activos", etiqueta: "Activas" },
  { valor: "terminados", etiqueta: "Terminadas" },
  { valor: "todos", etiqueta: "Todas" },
];

// Con texto en el buscador y sin estado elegido, se muestra todo: un pedido terminado que se
// busca por nombre no debe quedar escondido.
export function leerEstadoLista(valor: string | undefined, hayBusqueda: boolean): EstadoLista {
  if (valor === "activos" || valor === "terminados" || valor === "todos") return valor;
  return hayBusqueda ? "todos" : "activos";
}

// Valor del parámetro `estado` para el enlace: nada cuando es el de por omisión.
export function paramEstadoLista(estado: EstadoLista, hayBusqueda: boolean): string | undefined {
  return estado === leerEstadoLista(undefined, hayBusqueda) ? undefined : estado;
}

export function filtrarPorEstado<T>(filas: T[], estado: EstadoLista, terminada: (fila: T) => boolean): T[] {
  if (estado === "todos") return filas;
  return filas.filter((f) => terminada(f) === (estado === "terminados"));
}

export interface GrupoCliente<F> {
  cliente: string;
  filas: F[];
}

// Agrupa las filas por el cliente de su primer PM, en orden alfabético y con "Sin cliente" al final.
// Dentro de cada grupo se conserva el orden de la lista.
export function agruparPorCliente<F>(filas: F[], clienteDe: (fila: F) => string | null): GrupoCliente<F>[] {
  const grupos = new Map<string, F[]>();
  for (const fila of filas) {
    const cliente = clienteDe(fila) ?? SIN_CLIENTE;
    const lista = grupos.get(cliente);
    if (lista) lista.push(fila);
    else grupos.set(cliente, [fila]);
  }
  return [...grupos]
    .map(([cliente, f]) => ({ cliente, filas: f }))
    .sort((a, b) =>
      a.cliente === SIN_CLIENTE ? 1 : b.cliente === SIN_CLIENTE ? -1 : a.cliente.localeCompare(b.cliente, "es")
    );
}

export const SIN_CLIENTE = "Sin cliente";
