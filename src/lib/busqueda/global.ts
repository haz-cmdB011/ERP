// Buscador global (Ctrl + K): tipos compartidos entre la ruta /api/buscar y la
// ventana del buscador, más la parte que no toca la base (atajos a pantallas y
// armado de enlaces), para poder probarla aparte.

export type TipoResultado =
  | "pantalla"
  | "ot"
  | "pm"
  | "modelo"
  | "folio-calidad"
  | "folio-produccion"
  | "recibo";

export interface ResultadoBusqueda {
  tipo: TipoResultado;
  titulo: string;
  detalle?: string;
  href: string;
}

export interface GrupoBusqueda {
  titulo: string;
  resultados: ResultadoBusqueda[];
}

export type AreaBusqueda =
  "planeacion" | "produccion" | "calidad" | "estimaciones" | "usuarios";

export const MIN_CARACTERES_BUSQUEDA = 2;

// Quita acentos y mayúsculas para comparar ("planeacion" encuentra
// "Planeación").
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Texto seguro para los filtros de PostgREST (.ilike y .or): fuera los
// comodines de LIKE (% _ y el * de PostgREST) y los caracteres que separan
// condiciones en .or() (coma, paréntesis, comillas, diagonal invertida). Se
// cambian por espacio y se juntan los espacios, así "009-26" o "SDC-1" pasan
// tal cual.
export function terminoSeguro(texto: string): string {
  return texto
    .replace(/[%_*,()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Detalle del PM: la pantalla del área donde está el usuario (Producción y
// Calidad tienen la suya); desde las demás, la de Planeación.
export function hrefPedido(
  area: AreaBusqueda | null,
  pedidoId: string,
): string {
  const base =
    area === "produccion" || area === "calidad" ? area : "planeacion";
  return `/${base}/pedidos/${pedidoId}`;
}

export function hrefOrdenTrabajo(ot: string): string {
  return `/planeacion/ot/${encodeURIComponent(ot)}`;
}

// El filtro por modelo solo existe en el detalle de Planeación.
export function hrefModelo(pedidoId: string, modelo: string): string {
  return `/planeacion/pedidos/${pedidoId}?modelo=${encodeURIComponent(modelo)}`;
}

export function hrefRecibo(tipo: string, folio: string): string {
  return `/estimaciones/recibos/${tipo}/recibo/${encodeURIComponent(folio)}`;
}

interface Atajo {
  titulo: string;
  detalle: string;
  href: string;
  // Palabras extra con las que también se encuentra.
  claves?: string;
}

const ATAJOS_INTERNOS: Atajo[] = [
  {
    titulo: "Pedidos",
    detalle: "Planeación",
    href: "/planeacion",
    claves: "ot orden trabajo pm",
  },
  {
    titulo: "Cargar Excel",
    detalle: "Planeación",
    href: "/planeacion/upload",
    claves: "subir pedido manufactura archivo",
  },
  {
    titulo: "Cancelados",
    detalle: "Planeación",
    href: "/planeacion/cancelados",
    claves: "papelera eliminados",
  },
  {
    titulo: "Pedidos",
    detalle: "Producción",
    href: "/produccion",
    claves: "taller liberacion",
  },
  {
    titulo: "Folios de producción",
    detalle: "Producción",
    href: "/produccion/folios",
    claves: "viajero",
  },
  {
    titulo: "Cancelados",
    detalle: "Producción",
    href: "/produccion/cancelados",
    claves: "papelera eliminados",
  },
  {
    titulo: "Pedidos",
    detalle: "Calidad",
    href: "/calidad",
    claves: "informes",
  },
  {
    titulo: "Folios de calidad",
    detalle: "Calidad",
    href: "/calidad/folios",
    claves: "informes",
  },
  {
    titulo: "Cancelados",
    detalle: "Calidad",
    href: "/calidad/cancelados",
    claves: "papelera eliminados",
  },
  { titulo: "Panel", detalle: "Estimaciones", href: "/estimaciones" },
  {
    titulo: "Generador de Recibos",
    detalle: "Estimaciones",
    href: "/estimaciones/recibos",
    claves: "acabados armado electrificacion capturar",
  },
  {
    titulo: "Por revisar",
    detalle: "Estimaciones",
    href: "/estimaciones/registro?estado=pendiente",
    claves: "recibos pendientes revision",
  },
  {
    titulo: "Registro de recibos",
    detalle: "Estimaciones",
    href: "/estimaciones/registro",
    claves: "folios",
  },
  {
    titulo: "Mi cuenta",
    detalle: "Contraseña",
    href: "/planeacion/cuenta",
    claves: "contrasena perfil",
  },
];

const ATAJOS_MAQUILADOR: Atajo[] = [
  {
    titulo: "Generador de Recibos",
    detalle: "Estimaciones",
    href: "/estimaciones/recibos",
    claves: "capturar nuevo",
  },
  {
    titulo: "Mis recibos",
    detalle: "Estimaciones",
    href: "/estimaciones/mis-recibos",
    claves: "folios",
  },
];

const ATAJOS_DESARROLLADOR: Atajo[] = [
  {
    titulo: "Usuarios",
    detalle: "Administración",
    href: "/admin/usuarios",
    claves: "roles permisos",
  },
];

// Pantallas a las que puede ir el usuario que coinciden con lo escrito. Todas
// las palabras deben aparecer (en título, área o claves), en cualquier orden.
export function atajosCoincidentes(
  consulta: string,
  {
    maquilador,
    esDesarrollador,
  }: { maquilador: boolean; esDesarrollador: boolean },
): ResultadoBusqueda[] {
  const palabras = normalizarBusqueda(consulta).split(" ").filter(Boolean);
  if (palabras.length === 0) return [];
  const atajos = maquilador
    ? ATAJOS_MAQUILADOR
    : esDesarrollador
      ? [...ATAJOS_INTERNOS, ...ATAJOS_DESARROLLADOR]
      : ATAJOS_INTERNOS;
  return atajos
    .filter((a) => {
      const texto = normalizarBusqueda(
        `${a.titulo} ${a.detalle} ${a.claves ?? ""}`,
      );
      return palabras.every((p) => texto.includes(p));
    })
    .slice(0, 5)
    .map((a) => ({
      tipo: "pantalla",
      titulo: a.titulo,
      detalle: a.detalle,
      href: a.href,
    }));
}
