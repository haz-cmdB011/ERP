// Tablero del inicio de Producción: dos columnas por O.T. con una tarjeta por mueble o asignación.
// "Por entregar" junta lo que ya tiene equipo en taller, con su botón para registrar la entrega; "Por
// asignar", los muebles liberados que esperan equipo, con su botón para asignar (lo que sigue por liberar
// no sale: se libera antes, desde el carrito). La columna sale del estado, no se elige. Lo más reciente va
// primero y el tablero puede mostrar solo lo último que se trabajó. Lógica sin base de datos ni navegador, para
// poder probarla; la pantalla vive en tablero-marcas.tsx.

import { pmCorto } from "../planeacion/pm-corto";
import { textoPlazo, type Plazo } from "./atrasos";
import type { RenglonControl } from "./control-taller";
import { claveModelo, type Conteos, type ProcesoAvance } from "./inicio";

export type Columna = "por_entregar" | "por_asignar";

export const COLUMNAS_TABLERO: { valor: Columna; titulo: string }[] = [
  { valor: "por_entregar", titulo: "Por entregar" },
  { valor: "por_asignar", titulo: "Por asignar" },
];

// Tarjetas a la vista por columna antes de "Ver todas".
export const TARJETAS_POR_COLUMNA = 8;

// Cuántas tarjetas muestra el tablero en "Más recientes": las que tuvieron movimiento más reciente.
export const MAX_TARJETAS_RECIENTES = 30;

// Miniatura de un mueble (la primera imagen guardada) y su versión grande para el visor.
export interface ImagenTarjeta {
  url: string;
  urlGrande: string | null;
}

// Cómo va una asignación: lo que se ve en la vista previa de la tarjeta, sin salir del tablero.
export interface AvanceTarjeta {
  // Lo que el equipo ya entregó de lo asignado, lo asignado y su unidad.
  entregado: number;
  total: number;
  unidad: string;
  // Lo entregado en % de lo asignado (0 a 100).
  pct: number;
  // Lo que el equipo todavía tiene sin entregar y cuántos días lleva en taller.
  sinEntregar: number;
  diasEnTaller: number;
  // Cuándo fue su última entrega (ISO o día); null si no ha entregado.
  ultimaEntrega: string | null;
  // Día en que se asignó (AAAA-MM-DD): la entrega no puede ser anterior. null si no se sabe.
  fechaAsignacion: string | null;
  // El mueble se entrega por partes de su despiece: no se registra desde la tarjeta sino en el panel.
  porPartes: boolean;
  // Cómo va cada proceso del mueble (Armado, Barniz…); vacío si no se sabe.
  procesos: ProcesoAvance[];
}

// Aviso de plazo de una tarjeta, según la fecha de entrega de su PM: atrasada, vence hoy o vence pronto.
export interface PlazoTarjeta {
  texto: string;
  nivel: "vencido" | "hoy" | "por-vencer";
  // Menor = más urgente: las atrasadas (más días primero), hoy y las que vencen pronto (menos días primero).
  orden: number;
}

export function plazoDeTarjeta(plazo: Plazo | undefined): PlazoTarjeta | null {
  const texto = plazo ? textoPlazo(plazo) : null;
  if (!plazo || !texto) return null;
  if (plazo.tipo === "vencido") return { texto, nivel: "vencido", orden: -plazo.dias };
  if (plazo.tipo === "hoy") return { texto, nivel: "hoy", orden: 0 };
  if (plazo.tipo === "por-vencer") return { texto, nivel: "por-vencer", orden: plazo.dias };
  return null;
}

// Menor = más urgente; lo que no tiene aviso va después de todo lo que sí.
export const urgenciaDe = (t: Pick<TarjetaTablero, "plazo">): number => t.plazo?.orden ?? Number.POSITIVE_INFINITY;

const porUrgencia = (a: Pick<TarjetaTablero, "plazo">, b: Pick<TarjetaTablero, "plazo">): number => {
  const x = urgenciaDe(a);
  const y = urgenciaDe(b);
  return x === y ? 0 : x < y ? -1 : 1;
};

// Lo que necesita una tarjeta (solo datos simples: viaja del servidor al navegador).
export interface TarjetaTablero {
  // asignacion:<id> o mueble:<id>
  clave: string;
  columna: Columna;
  asignacionId: string | null;
  itemId: string | null;
  modelo: string;
  // Equipo y proceso de la asignación; null si ningún equipo lo tiene.
  subtitulo: string | null;
  // En Por asignar, cuánto falta ("13 PZA" o "Faltan 8 de 13 PZA · Armado" si ya se asignó una parte).
  piezas: string;
  ot: string | null;
  numeroPm: string;
  // Lo que se ve del PM: solo "PM009-26" o, si es una solicitud de cambio, solo "SDC-1" (ver pmCorto).
  pmCorto: string;
  // El pase de lista de una asignación (palomita o tache de Producción) y su nota; null si no se ha marcado.
  marca: boolean | null;
  nota: string | null;
  // Miniatura del mueble; null si no tiene imagen.
  imagen: ImagenTarjeta | null;
  // Cuántos muebles de su modelo hay en cada estado (por liberar, por asignar, en taller, terminados): los
  // mismos anillos de la lista. null si no se sabe.
  conteos: Conteos | null;
  // Lo último que le pasó (ISO o día; "" si no se sabe): ordena lo más reciente primero.
  reciente: string;
  // Aviso de plazo del PM (atrasada, vence hoy, vence pronto); null si no hay nada que avisar. Lo urgente va primero.
  plazo: PlazoTarjeta | null;
  // Los accesos de siempre: el nombre del modelo abre el panel de asignación y la O.T. y el PM abren sus
  // pantallas (la O.T. abre el pedido si no tiene O.T. con formato).
  hrefModelo: string;
  hrefOt: string;
  hrefPm: string;
  // Por asignar: el panel de asignación con ese mueble abierto. null en las asignaciones.
  hrefAsignar: string | null;
  // Por entregar: el panel de asignación con el mueble de la asignación (ahí se entrega por partes). null
  // en los muebles por asignar.
  hrefPanel: string | null;
  // Por entregar: cómo va, para registrar la entrega y la vista previa. null en los muebles por asignar.
  avance: AvanceTarjeta | null;
}

// En qué columna cae un renglón, o null si no va en el tablero: una asignación entregada, un mueble por
// liberar (se libera antes) o uno que ya tiene su trabajo en otro lado.
function columnaDeRenglon(r: RenglonControl): Columna | null {
  if (r.asignacionId) return r.enTaller ? "por_entregar" : null;
  return r.estadoInicio === "por_asignar" ? "por_asignar" : null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

function avanceDe(r: RenglonControl, unidad: string): AvanceTarjeta {
  const total = r.cantidad;
  return {
    entregado: redondear(r.entregado),
    total,
    unidad,
    pct: total > 0 ? Math.min(100, Math.max(0, Math.round((100 * r.entregado) / total))) : 0,
    sinEntregar: redondear(r.tiene),
    diasEnTaller: r.diasEnTaller,
    ultimaEntrega: r.ultimaEntrega,
    fechaAsignacion: r.fechaAsignacion,
    porPartes: r.porPartes,
    procesos: r.procesos,
  };
}

// "04/11" de un día "AAAA-MM-DD" (o ISO); "" si no es una fecha.
export function diaCorto(fecha: string | null): string {
  const m = fecha ? /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha) : null;
  return m ? `${m[3]}/${m[2]}` : "";
}

// `imagenes`: la miniatura de cada mueble, por su id; `conteosPorModelo`: los anillos de cada modelo, por su
// clave (ver claveModelo); `plazos`: el plazo de cada PM, por su id. Las tarjetas salen con lo urgente primero
// (atrasadas, vencen hoy, vencen pronto) y, a igual urgencia, lo más reciente (a igual momento, en el orden
// en que llegaron).
export function tarjetasDeControl(
  renglones: RenglonControl[],
  {
    imagenes = {},
    conteosPorModelo = new Map(),
    plazos = new Map(),
  }: {
    imagenes?: Record<string, ImagenTarjeta>;
    conteosPorModelo?: ReadonlyMap<string, Conteos>;
    plazos?: ReadonlyMap<string, Plazo>;
  } = {}
): TarjetaTablero[] {
  const tarjetas: TarjetaTablero[] = [];
  for (const r of renglones) {
    const columna = columnaDeRenglon(r);
    if (!columna) continue;
    const unidad = (r.unidad ?? "").trim();
    // Un mueble asignado a medias dice cuánto falta del paso en que va; si no, su cantidad del PM.
    const falta = columna === "por_asignar" ? r.faltaAsignar : null;
    const piezas =
      falta && falta.cantidad < falta.total
        ? `Faltan ${falta.cantidad} de ${falta.total} ${unidad}`.trim() + (falta.etiqueta ? ` · ${falta.etiqueta}` : "")
        : `${r.cantidad} ${unidad}`.trim();
    tarjetas.push({
      clave: r.clave,
      columna,
      asignacionId: r.asignacionId,
      itemId: r.itemId,
      modelo: r.modelo,
      subtitulo: r.equipo ? `${r.equipo}${r.proceso ? ` · ${r.proceso}` : ""}` : null,
      piezas,
      ot: r.ot,
      numeroPm: r.numeroPm,
      pmCorto: pmCorto(r.numeroPm),
      marca: r.marca,
      nota: r.nota,
      imagen: (r.planeacionItemId && imagenes[r.planeacionItemId]) || null,
      conteos: conteosPorModelo.get(claveModelo(r.modelo)) ?? null,
      reciente: r.reciente,
      plazo: plazoDeTarjeta(r.pedidoId ? plazos.get(r.pedidoId) : undefined),
      hrefModelo: `/produccion/panel?estado=todos&q=${encodeURIComponent(r.modelo)}`,
      hrefOt: r.ot && /^\d+-\d{2}$/.test(r.ot) ? `/produccion/ot/${r.ot}` : `/produccion/pedidos/${r.pedidoId}`,
      hrefPm: r.pedidoId ? `/produccion/pedidos/${r.pedidoId}` : r.ot && /^\d+-\d{2}$/.test(r.ot) ? `/produccion/ot/${r.ot}` : "/produccion/pedidos",
      hrefAsignar: columna === "por_asignar" && r.itemId ? `/produccion/panel?ids=${r.itemId}` : null,
      hrefPanel: columna === "por_entregar" && r.planeacionItemId ? `/produccion/panel?ids=${r.planeacionItemId}` : null,
      avance: columna === "por_entregar" ? avanceDe(r, unidad) : null,
    });
  }
  return tarjetas.sort((a, b) => porUrgencia(a, b) || b.reciente.localeCompare(a.reciente));
}

// Claves de las `n` tarjetas que más importan: primero lo urgente (atrasadas, vencen hoy o pronto) y después lo
// de movimiento más reciente (a igual momento, las primeras de la lista).
export function clavesMasRecientes(tarjetas: TarjetaTablero[], n: number = MAX_TARJETAS_RECIENTES): Set<string> {
  return new Set(
    tarjetas
      .map((t, i) => ({ t, i }))
      .sort((a, b) => porUrgencia(a.t, b.t) || b.t.reciente.localeCompare(a.t.reciente) || a.i - b.i)
      .slice(0, n)
      .map(({ t }) => t.clave)
  );
}

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

// Una sección del tablero: todas las tarjetas de una O.T. (o las que no tienen O.T.), cada una con sus
// dos columnas.
export interface SeccionTablero {
  // Clave estable de la sección (la O.T., o "sin-ot").
  clave: string;
  ot: string | null;
  titulo: string;
  hrefOt: string | null;
  // Lo último que le pasó a alguna de sus tarjetas (vacío si no se sabe).
  reciente: string;
  // Cuántas de sus tarjetas están atrasadas y la urgencia de la más urgente (ver urgenciaDe).
  atrasadas: number;
  urgencia: number;
  tarjetas: TarjetaTablero[];
}

export const claveSeccion = (t: Pick<TarjetaTablero, "ot">): string => t.ot ?? "sin-ot";

// Agrupa las tarjetas por O.T.: primero la que tuvo movimiento más reciente (a igual momento, la de
// número mayor) y lo que no tiene O.T. al final. Dentro de cada sección conserva el orden de la lista.
export function seccionesPorOt(tarjetas: TarjetaTablero[]): SeccionTablero[] {
  const porClave = new Map<string, SeccionTablero>();
  for (const t of tarjetas) {
    const clave = claveSeccion(t);
    let s = porClave.get(clave);
    if (!s) {
      s = {
        clave,
        ot: t.ot,
        titulo: t.ot ? `O.T. ${t.ot}` : "Sin O.T.",
        hrefOt: t.ot && /^\d+-\d{2}$/.test(t.ot) ? t.hrefOt : null,
        reciente: "",
        atrasadas: 0,
        urgencia: Number.POSITIVE_INFINITY,
        tarjetas: [],
      };
      porClave.set(clave, s);
    }
    s.tarjetas.push(t);
    if (t.reciente > s.reciente) s.reciente = t.reciente;
    if (t.plazo?.nivel === "vencido") s.atrasadas += 1;
    s.urgencia = Math.min(s.urgencia, urgenciaDe(t));
  }
  return [...porClave.values()].sort((a, b) => {
    if (a.ot === null) return 1;
    if (b.ot === null) return -1;
    const porSeccion = a.urgencia === b.urgencia ? 0 : a.urgencia < b.urgencia ? -1 : 1;
    return porSeccion || b.reciente.localeCompare(a.reciente) || natural(b.ot, a.ot);
  });
}

// Las tarjetas de una lista (una sección) que están en una columna.
export const enColumna = (tarjetas: TarjetaTablero[], columna: Columna): TarjetaTablero[] =>
  tarjetas.filter((t) => t.columna === columna);

// Cuántas hay en cada columna.
export function conteosColumnas(tarjetas: TarjetaTablero[]): Record<Columna, number> {
  return { por_entregar: enColumna(tarjetas, "por_entregar").length, por_asignar: enColumna(tarjetas, "por_asignar").length };
}
