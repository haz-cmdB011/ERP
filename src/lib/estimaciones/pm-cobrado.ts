// PM contra cobrado, por OT: por OT y modelo, lo que Planeación declaró en todos
// los PM de la OT contra lo que se ha capturado en recibos vigentes de
// Acabados, Armado y Electrificación (función ot_contra_cobrado, ver
// supabase/migrations/20261001190000_recibos_por_ot.sql, con las mismas reglas
// que el control al guardar). Aquí se clasifica cada celda y se resume el
// avance por OT.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AreaCobro = "acabados" | "armado" | "electrificacion";
export const AREAS_COBRO: AreaCobro[] = ["acabados", "armado", "electrificacion"];

export interface FilaPmCobrado {
  // Clave de la OT ("193-24").
  ot: string;
  proyecto: string | null;
  numPms: number;
  // Los PM de la OT ("2PM193-24, 7PM193-24").
  pms: string;
  modelo: string;
  descripcion: string | null;
  // null: el modelo se cobró pero no está en ningún PM de la OT.
  cantidadPm: number | null;
  // Parte del PM con iluminación (lo que se electrifica).
  cantidadPmIluminacion: number;
  acabados: number;
  armado: number;
  electrificacion: number;
  // Reprocesos de Acabados/Armado: se pagan aparte, no gastan saldo del PM.
  reprocesos: number;
  discrepanciasPendientes: number;
}

export type EstadoCobro =
  // Nada que cobrar en esta área (ej. un mueble sin iluminación en Electrificación).
  | "no_aplica"
  | "sin_cobro"
  | "parcial"
  | "completo"
  | "excedido"
  // Se cobró un modelo que no está en el PM.
  | "fuera_del_pm";

// Contra qué cantidad se compara cada área. Electrificación, para todos, solo
// contra los muebles con iluminación (misma regla que el control al guardar):
// electrificar un mueble sin iluminación cuenta como cobrado de más.
export function baseArea(fila: FilaPmCobrado, area: AreaCobro): number | null {
  if (fila.cantidadPm == null) return null;
  return area === "electrificacion" ? fila.cantidadPmIluminacion : fila.cantidadPm;
}

export function estadoCobro(cobrado: number, base: number | null): EstadoCobro {
  if (base == null) return cobrado > 0 ? "fuera_del_pm" : "no_aplica";
  if (cobrado > base) return "excedido";
  if (base === 0) return "no_aplica";
  if (cobrado === 0) return "sin_cobro";
  return cobrado === base ? "completo" : "parcial";
}

export function estadoCelda(fila: FilaPmCobrado, area: AreaCobro): EstadoCobro {
  return estadoCobro(fila[area], baseArea(fila, area));
}

// Un modelo con algo que revisar: cobrado de más o fuera del PM.
export function tieneDiferencias(fila: FilaPmCobrado): boolean {
  return AREAS_COBRO.some((a) => {
    const e = estadoCelda(fila, a);
    return e === "excedido" || e === "fuera_del_pm";
  });
}

// Le falta cobrar algo en alguna área.
export function tienePendienteDeCobro(fila: FilaPmCobrado): boolean {
  return AREAS_COBRO.some((a) => {
    const e = estadoCelda(fila, a);
    return e === "sin_cobro" || e === "parcial";
  });
}

export interface AvanceArea {
  // Piezas cobradas sin contar lo que excede el PM.
  cobrado: number;
  base: number;
}

export interface ResumenOt {
  ot: string;
  proyecto: string | null;
  numPms: number;
  pms: string;
  modelos: number;
  piezasPm: number;
  avance: Record<AreaCobro, AvanceArea>;
  // Modelos cobrados de más en alguna área.
  excedidos: number;
  fueraDelPm: number;
  discrepanciasPendientes: number;
}

// Resumen por OT, en el orden en que llegan las filas.
export function resumirPorOt(filas: FilaPmCobrado[]): ResumenOt[] {
  const porOt = new Map<string, ResumenOt>();
  for (const f of filas) {
    let r = porOt.get(f.ot);
    if (!r) {
      r = {
        ot: f.ot,
        proyecto: f.proyecto,
        numPms: f.numPms,
        pms: f.pms,
        modelos: 0,
        piezasPm: 0,
        avance: {
          acabados: { cobrado: 0, base: 0 },
          armado: { cobrado: 0, base: 0 },
          electrificacion: { cobrado: 0, base: 0 },
        },
        excedidos: 0,
        fueraDelPm: 0,
        discrepanciasPendientes: 0,
      };
      porOt.set(f.ot, r);
    }
    r.discrepanciasPendientes += f.discrepanciasPendientes;
    if (f.cantidadPm == null) {
      r.fueraDelPm += 1;
      continue;
    }
    r.modelos += 1;
    r.piezasPm += f.cantidadPm;
    let excedido = false;
    for (const a of AREAS_COBRO) {
      const base = baseArea(f, a) ?? 0;
      r.avance[a].base += base;
      r.avance[a].cobrado += Math.min(f[a], base);
      if (f[a] > base) excedido = true;
    }
    if (excedido) r.excedidos += 1;
  }
  return [...porOt.values()];
}

export function porcentaje({ cobrado, base }: AvanceArea): number | null {
  return base > 0 ? Math.round((cobrado / base) * 100) : null;
}

interface FilaRpc {
  orden_trabajo: string;
  proyecto: string | null;
  num_pms: number;
  pms: string | null;
  modelo: string;
  descripcion: string | null;
  cantidad_pm: number | null;
  cantidad_pm_iluminacion: number;
  acabados: number;
  armado: number;
  electrificacion: number;
  reprocesos: number;
  discrepancias_pendientes: number;
}

const PAGINA = 1000;

// Todas las filas (la API corta cada respuesta en 1000). ot: solo esa OT.
export async function cargarOtContraCobrado(
  supabase: SupabaseClient,
  ot?: string
): Promise<{ filas: FilaPmCobrado[]; error: string | null }> {
  const filas: FilaPmCobrado[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .rpc("ot_contra_cobrado", { p_ot: ot ?? null })
      .range(desde, desde + PAGINA - 1);
    if (error) return { filas, error: error.message };
    const pagina = (data ?? []) as FilaRpc[];
    for (const r of pagina) {
      filas.push({
        ot: r.orden_trabajo,
        proyecto: r.proyecto,
        numPms: Number(r.num_pms),
        pms: r.pms ?? "",
        modelo: r.modelo,
        descripcion: r.descripcion || null,
        cantidadPm: r.cantidad_pm == null ? null : Number(r.cantidad_pm),
        cantidadPmIluminacion: Number(r.cantidad_pm_iluminacion),
        acabados: Number(r.acabados),
        armado: Number(r.armado),
        electrificacion: Number(r.electrificacion),
        reprocesos: Number(r.reprocesos),
        discrepanciasPendientes: Number(r.discrepancias_pendientes),
      });
    }
    if (pagina.length < PAGINA) return { filas, error: null };
  }
}
