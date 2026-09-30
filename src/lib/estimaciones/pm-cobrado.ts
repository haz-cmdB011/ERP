// PM contra cobrado: por PM y modelo, lo que Planeación declaró contra lo que
// se ha capturado en recibos vigentes de Acabados, Armado y Electrificación
// (función pm_contra_cobrado, ver
// supabase/migrations/20260930192435_pm_contra_cobrado.sql, con las mismas
// reglas que el control al guardar). Aquí se clasifica cada celda y se resume
// el avance por PM.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AreaCobro = "acabados" | "armado" | "electrificacion";
export const AREAS_COBRO: AreaCobro[] = ["acabados", "armado", "electrificacion"];

export interface FilaPmCobrado {
  pedidoId: string;
  numeroPedido: string;
  ordenTrabajo: string | null;
  proyecto: string | null;
  modelo: string;
  descripcion: string | null;
  // null: el modelo se cobró pero no está en el PM.
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

export interface ResumenPm {
  pedidoId: string;
  numeroPedido: string;
  ordenTrabajo: string | null;
  proyecto: string | null;
  modelos: number;
  piezasPm: number;
  avance: Record<AreaCobro, AvanceArea>;
  // Modelos cobrados de más en alguna área.
  excedidos: number;
  fueraDelPm: number;
  discrepanciasPendientes: number;
}

// Resumen por PM, en el orden en que llegan las filas.
export function resumirPorPm(filas: FilaPmCobrado[]): ResumenPm[] {
  const porPm = new Map<string, ResumenPm>();
  for (const f of filas) {
    let r = porPm.get(f.pedidoId);
    if (!r) {
      r = {
        pedidoId: f.pedidoId,
        numeroPedido: f.numeroPedido,
        ordenTrabajo: f.ordenTrabajo,
        proyecto: f.proyecto,
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
      porPm.set(f.pedidoId, r);
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
  return [...porPm.values()];
}

export function porcentaje({ cobrado, base }: AvanceArea): number | null {
  return base > 0 ? Math.round((cobrado / base) * 100) : null;
}

interface FilaRpc {
  pedido_id: string;
  numero_pedido: string;
  orden_trabajo: string | null;
  proyecto: string | null;
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

// Todas las filas (la API corta cada respuesta en 1000). pedidoId: solo ese PM.
export async function cargarPmContraCobrado(
  supabase: SupabaseClient,
  pedidoId?: string
): Promise<{ filas: FilaPmCobrado[]; error: string | null }> {
  const filas: FilaPmCobrado[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .rpc("pm_contra_cobrado", { p_pedido: pedidoId ?? null })
      .range(desde, desde + PAGINA - 1);
    if (error) return { filas, error: error.message };
    const pagina = (data ?? []) as FilaRpc[];
    for (const r of pagina) {
      filas.push({
        pedidoId: r.pedido_id,
        numeroPedido: r.numero_pedido,
        ordenTrabajo: r.orden_trabajo,
        proyecto: r.proyecto,
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
