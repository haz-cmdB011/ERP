// Recibos por llegar: vista previa, en el panel de Estimaciones, de lo que los
// maquiladores ya pueden cobrar y todavía no tiene recibo.
//
// El maquilador solo cobra lo que Calidad aprobó (por entrega o en la revisión
// final del mueble; ver supabase/migrations/20261026163548_recibos_por_llegar.sql),
// así que aquí la base es siempre "Calidad aprobó", aunque el ajuste
// cobro_segun_produccion mida "PM contra cobrado" contra Producción. Solo Acabados
// y Armado: Electrificación no pasa por Calidad.
//
// Los equipos de Producción no están ligados al contratista que cobra, así que no
// se sabe quién mandará cada recibo: se cuentan muebles y piezas, y como mínimo un
// recibo por O.T. y área (un recibo es de una sola O.T.). El importe se estima con
// el último precio pagado de ese modelo en esa área (el precedente del motor de
// precios); sin precedente, el renglón cuenta como "sin precio".
//
// También se ve cada mueble que un equipo externo ya entregó a Calidad, aunque no
// esté aprobado: lo entregado, lo aprobado y, por parte del despiece, sus piezas
// (muebles_en_calidad, supabase/migrations/20261026165951_muebles_en_calidad.sql).
// Un mueble se cobra cuando todas sus partes (el cobro por partes es la fase 3).

import { aprobadoArea, type FilaPmCobrado } from "./pm-cobrado";
import { precedenteDe } from "./motor-precio";
import { claveDescripcion, claveModelo } from "./conciliacion-pm";
import type { RenglonHistorico } from "./datos-acabados";

export type AreaPorLlegar = "acabados" | "armado";
export const AREAS_POR_LLEGAR: AreaPorLlegar[] = ["acabados", "armado"];

// Proceso de Producción que se cobra en cada área (el barniz es Acabados).
const AREA_DE_PROCESO: Record<string, AreaPorLlegar> = { barniz: "acabados", armado: "armado" };

export interface RenglonPorLlegar {
  area: AreaPorLlegar;
  ot: string;
  proyecto: string | null;
  modelo: string;
  descripcion: string | null;
  esComponente: boolean;
  itemCodigo: string | null;
  padreModelo: string | null;
  aprobado: number;
  cobrado: number;
  // Aprobado por Calidad y sin recibo.
  listo: number;
  // Último precio pagado (null: sin precedente).
  pu: number | null;
  folioPrecio: string | null;
  fechaPrecio: string | null;
  importe: number | null;
}

// Lo aprobado por Calidad en un área que todavía no se cobra (0 si no hay dato).
export function listoPorCalidad(fila: FilaPmCobrado, area: AreaPorLlegar): number {
  if (fila.cantidadPm == null) return 0;
  const aprobado = aprobadoArea(fila, area);
  return aprobado == null ? 0 : Math.max(0, aprobado - fila[area]);
}

export function renglonesPorLlegar(
  filas: FilaPmCobrado[],
  historicos: Record<AreaPorLlegar, RenglonHistorico[]>
): RenglonPorLlegar[] {
  const out: RenglonPorLlegar[] = [];
  for (const f of filas) {
    for (const area of AREAS_POR_LLEGAR) {
      const listo = listoPorCalidad(f, area);
      if (listo <= 0) continue;
      const p = precedenteDe(f.modelo, historicos[area], undefined, undefined, f.descripcion);
      out.push({
        area,
        ot: f.ot,
        proyecto: f.proyecto,
        modelo: f.modelo,
        descripcion: f.descripcion,
        esComponente: f.esComponente,
        itemCodigo: f.itemCodigo,
        padreModelo: f.padreModelo,
        aprobado: aprobadoArea(f, area) ?? 0,
        cobrado: f[area],
        listo,
        pu: p ? p.aceptado : null,
        folioPrecio: p?.folio || null,
        fechaPrecio: p?.fecha || null,
        importe: p ? Math.round(p.aceptado * listo * 100) / 100 : null,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.area.localeCompare(b.area) ||
      a.ot.localeCompare(b.ot) ||
      Number(a.esComponente) - Number(b.esComponente) ||
      a.modelo.localeCompare(b.modelo)
  );
}

export interface ResumenArea {
  area: AreaPorLlegar;
  // Muebles padre y componentes listos (cantidades, no renglones).
  muebles: number;
  componentes: number;
  renglones: number;
  // Al menos un recibo por O.T.
  recibosMinimos: number;
  ots: string[];
  importe: number;
  // Renglones sin precedente de precio (su importe no está en `importe`).
  sinPrecio: number;
  // Muebles entregados a Calidad (tarjetas) y los que esperan su revisión.
  enCalidad: number;
  enRevision: number;
}

export function resumirPorArea(renglones: RenglonPorLlegar[], muebles: MuebleEnCalidad[] = []): ResumenArea[] {
  return AREAS_POR_LLEGAR.map((area) => {
    const delArea = renglones.filter((r) => r.area === area);
    const enCalidad = muebles.filter((m) => m.area === area);
    const ots = Array.from(new Set(delArea.map((r) => r.ot))).sort();
    return {
      area,
      muebles: delArea.filter((r) => !r.esComponente).reduce((s, r) => s + r.listo, 0),
      componentes: delArea.filter((r) => r.esComponente).reduce((s, r) => s + r.listo, 0),
      renglones: delArea.length,
      recibosMinimos: ots.length,
      ots,
      importe: Math.round(delArea.reduce((s, r) => s + (r.importe ?? 0), 0) * 100) / 100,
      sinPrecio: delArea.filter((r) => r.importe == null).length,
      enCalidad: enCalidad.length,
      enRevision: enCalidad.reduce((s, m) => s + m.enRevision, 0),
    };
  });
}

// Una fila de muebles_en_calidad: una parte (o el mueble completo, parteId null)
// de un mueble en un proceso.
export interface FilaMuebleEnCalidad {
  ot: string;
  itemId: string;
  itemCodigo: string | null;
  modelo: string;
  descripcion: string | null;
  cantidad: number;
  proceso: string;
  parteId: string | null;
  parte: string | null;
  // En muebles para el mueble completo (1).
  piezasPorMueble: number;
  entregadas: number;
  aprobadas: number;
  // Veces que la ruta lleva el proceso (cada vez se cobra).
  veces: number;
  // Lo aprobado del mueble en la revisión final.
  finalAprobadas: number;
}

export interface ParteEnCalidad {
  parte: string;
  entregadas: number;
  aprobadas: number;
  // Piezas de la parte en todo el mueble: piezas por mueble × cantidad × veces.
  total: number;
}

export interface MuebleEnCalidad {
  area: AreaPorLlegar;
  ot: string;
  itemId: string;
  itemCodigo: string | null;
  modelo: string;
  descripcion: string | null;
  // Lo que se cobraría en el área: cantidad × veces que la ruta lleva el proceso.
  porCobrar: number;
  // Muebles completos (lo que alcanza la parte más atrasada).
  entregados: number;
  aprobados: number;
  // Entregado que Calidad todavía no aprueba.
  enRevision: number;
  // Solo muebles con despiece.
  partes: ParteEnCalidad[];
  // Lo cobrado del modelo en la O.T. (null: el modelo no está en "PM contra cobrado").
  cobrado: number | null;
  // El renglón por cobrar del modelo, si lo hay (con su importe).
  porLlegar: RenglonPorLlegar | null;
}

// Muebles completos con lo de cada parte: lo del mueble completo más la parte más
// atrasada (piezas ÷ piezas por mueble), hacia abajo. Como cobertura_por_partes.
function cobertura(filas: FilaMuebleEnCalidad[], valor: (f: FilaMuebleEnCalidad) => number): number {
  const mueble = filas.filter((f) => f.parteId == null).reduce((s, f) => s + valor(f), 0);
  const partes = filas.filter((f) => f.parteId != null);
  if (partes.length === 0) return Math.floor(mueble);
  return Math.floor(mueble + Math.min(...partes.map((f) => valor(f) / f.piezasPorMueble)));
}

function claveVariante(ot: string, modelo: string, descripcion: string | null): string {
  return `${ot}|${claveModelo(modelo)}|${claveDescripcion(descripcion)}`;
}

// Cada mueble entregado a Calidad, por área, con lo cobrado de su modelo en la O.T.
// (los recibos cobran por modelo, no por mueble).
export function mueblesEnCalidad(
  filas: FilaMuebleEnCalidad[],
  cobrado: FilaPmCobrado[],
  renglones: RenglonPorLlegar[]
): MuebleEnCalidad[] {
  const variantes = new Map<string, FilaPmCobrado>();
  for (const f of cobrado) {
    if (!f.esComponente) variantes.set(claveVariante(f.ot, f.modelo, f.descripcion), f);
  }
  const grupos = new Map<string, FilaMuebleEnCalidad[]>();
  for (const f of filas) {
    if (!AREA_DE_PROCESO[f.proceso] || !(f.piezasPorMueble > 0)) continue;
    const clave = `${f.itemId}|${f.proceso}`;
    const g = grupos.get(clave);
    if (g) g.push(f);
    else grupos.set(clave, [f]);
  }
  const out: MuebleEnCalidad[] = [];
  for (const g of grupos.values()) {
    const [f] = g;
    const area = AREA_DE_PROCESO[f.proceso];
    const porCobrar = f.cantidad * Math.max(1, f.veces);
    const entregados = Math.min(porCobrar, cobertura(g, (x) => x.entregadas));
    // La revisión final aprueba el mueble entero, sin pasar de lo entregado.
    const aprobados = Math.min(
      porCobrar,
      Math.max(cobertura(g, (x) => x.aprobadas), Math.min(entregados, f.finalAprobadas))
    );
    const clave = claveVariante(f.ot, f.modelo, f.descripcion);
    const variante = variantes.get(clave);
    out.push({
      area,
      ot: f.ot,
      itemId: f.itemId,
      itemCodigo: f.itemCodigo,
      modelo: f.modelo,
      descripcion: f.descripcion,
      porCobrar,
      entregados,
      aprobados,
      enRevision: Math.max(0, entregados - aprobados),
      partes: g
        .filter((x) => x.parteId != null)
        .map((x) => ({
          parte: x.parte ?? "",
          entregadas: x.entregadas,
          aprobadas: x.aprobadas,
          total: x.piezasPorMueble * porCobrar,
        })),
      cobrado: variante ? variante[area] : null,
      porLlegar:
        renglones.find(
          (r) => r.area === area && !r.esComponente && claveVariante(r.ot, r.modelo, r.descripcion) === clave
        ) ?? null,
    });
  }
  return out.sort(
    (a, b) =>
      a.ot.localeCompare(b.ot) ||
      (a.itemCodigo ?? "").localeCompare(b.itemCodigo ?? "", "es", { numeric: true }) ||
      a.area.localeCompare(b.area)
  );
}

// Lo por cobrar que no sale en ninguna tarjeta de mueble: componentes y modelos
// sin entregas leídas (por ejemplo, si no se pudo leer muebles_en_calidad).
export function renglonesSueltos(renglones: RenglonPorLlegar[], muebles: MuebleEnCalidad[]): RenglonPorLlegar[] {
  const enTarjeta = new Set(muebles.map((m) => m.porLlegar).filter((r) => r != null));
  return renglones.filter((r) => !enTarjeta.has(r));
}
