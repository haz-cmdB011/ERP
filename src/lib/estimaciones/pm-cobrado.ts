// PM contra cobrado, por OT: por OT y variante de modelo (código + descripción
// del padre), lo que Planeación declaró en todos los PM de la OT contra lo que
// se ha capturado en recibos vigentes de Acabados, Armado y Electrificación
// (función ot_contra_cobrado, ver
// supabase/migrations/20261002154916_variantes_modelo_iluminacion.sql, con las
// mismas reglas que el control al guardar). Aquí se clasifica cada celda y se resume el
// avance por OT.
//
// Cuadre con Calidad (supabase/migrations/20261014195109_cuadre_calidad_recibos.sql):
// además de los muebles padre, cada O.T. trae sus COMPONENTES (hijos) como filas
// aparte, y por área lo que Calidad ya aprobó (aprobadoAcabados / aprobadoArmado).
// "Listo para cobrar" = aprobado por Calidad y todavía sin recibo; un recibo que
// cobra más de lo aprobado queda marcado. Los componentes no suman en las barras
// de avance: el mueble padre ya cuenta su cantidad.

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
  // Lo esperado en Acabados y en Armado: la cantidad del PM por las veces que la
  // ruta de Producción del mueble lleva Barniz o Armado (mínimo 1; ver
  // supabase/migrations/20261019155404_recibos_procesos_repetidos.sql). null si
  // el modelo no está en el PM.
  cantidadPmAcabados: number | null;
  cantidadPmArmado: number | null;
  acabados: number;
  armado: number;
  electrificacion: number;
  // Reprocesos de Acabados/Armado: se pagan aparte, no gastan saldo del PM.
  reprocesos: number;
  discrepanciasPendientes: number;
  // Un componente (hijo) de un mueble, no el mueble.
  esComponente: boolean;
  // Solo componentes: su número ("4.02"), su material y el código del mueble del
  // que son parte (puede ser distinto al suyo: M-CONT de M-CONT-M).
  itemCodigo: string | null;
  material: string | null;
  padreModelo: string | null;
  // Lo que Calidad ya aprobó por área. null: no aplica o no hay con qué comparar
  // (el mueble no pasó por Producción en el sistema, o el modelo no está en el PM).
  aprobadoAcabados: number | null;
  aprobadoArmado: number | null;
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
// electrificar un mueble sin iluminación cuenta como cobrado de más. Acabados y
// Armado, contra la cantidad del PM tantas veces como la ruta repita el proceso.
export function baseArea(fila: FilaPmCobrado, area: AreaCobro): number | null {
  if (fila.cantidadPm == null) return null;
  if (area === "electrificacion") return fila.cantidadPmIluminacion;
  return (area === "acabados" ? fila.cantidadPmAcabados : fila.cantidadPmArmado) ?? fila.cantidadPm;
}

// Áreas que esperan más que la cantidad del PM porque la ruta repite su proceso
// (para explicarlo en pantalla): [área, lo esperado].
export function areasRepetidas(fila: FilaPmCobrado): ["acabados" | "armado", number][] {
  if (fila.cantidadPm == null) return [];
  const salida: ["acabados" | "armado", number][] = [];
  for (const area of ["armado", "acabados"] as const) {
    const base = baseArea(fila, area);
    if (base != null && base > fila.cantidadPm) salida.push([area, base]);
  }
  return salida;
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

// Le falta cobrar algo en alguna área (según el PM). Los componentes no entran:
// su mueble padre ya cuenta la cantidad y esto los llenaría de falsos pendientes
// cuando se cobra el mueble completo.
export function tienePendienteDeCobro(fila: FilaPmCobrado): boolean {
  if (fila.esComponente) return false;
  return AREAS_COBRO.some((a) => {
    const e = estadoCelda(fila, a);
    return e === "sin_cobro" || e === "parcial";
  });
}

// Lo que Calidad aprobó en un área; null si no hay dato (Electrificación no se
// compara con Calidad: Producción no la asigna).
export function aprobadoArea(fila: FilaPmCobrado, area: AreaCobro): number | null {
  if (area === "acabados") return fila.aprobadoAcabados;
  if (area === "armado") return fila.aprobadoArmado;
  return null;
}

// Lo que Calidad ya aprobó y todavía no tiene recibo en esa área.
export function listoParaCobrar(fila: FilaPmCobrado, area: AreaCobro): number {
  const aprobado = aprobadoArea(fila, area);
  return aprobado == null ? 0 : Math.max(0, aprobado - fila[area]);
}

export function tieneListoParaCobrar(fila: FilaPmCobrado): boolean {
  return AREAS_COBRO.some((a) => listoParaCobrar(fila, a) > 0);
}

// Lo cobrado en un área por encima de lo que Calidad aprobó (0 si no hay dato).
export function cobradoSobreCalidad(fila: FilaPmCobrado, area: AreaCobro): number {
  const aprobado = aprobadoArea(fila, area);
  return aprobado == null ? 0 : Math.max(0, fila[area] - aprobado);
}

export function tieneSobreCalidad(fila: FilaPmCobrado): boolean {
  return AREAS_COBRO.some((a) => cobradoSobreCalidad(fila, a) > 0);
}

// Algo que revisar: diferencias con el PM o cobrado sin aprobación de Calidad.
export function tieneDiferenciasOCalidad(fila: FilaPmCobrado): boolean {
  return tieneDiferencias(fila) || tieneSobreCalidad(fila);
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
  // Renglones (mueble o componente, por área) cobrados por encima de lo que Calidad aprobó.
  sobreCalidad: number;
  // Renglones de muebles que Calidad ya aprobó y todavía no tienen recibo (por área),
  // y los de componentes aparte: o se cobra el mueble o sus partes, no se suman.
  listoParaCobrar: number;
  listoComponentes: number;
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
        sobreCalidad: 0,
        listoParaCobrar: 0,
        listoComponentes: 0,
      };
      porOt.set(f.ot, r);
    }
    r.discrepanciasPendientes += f.discrepanciasPendientes;
    for (const a of AREAS_COBRO) {
      if (cobradoSobreCalidad(f, a) > 0) r.sobreCalidad += 1;
      if (listoParaCobrar(f, a) > 0) {
        if (f.esComponente) r.listoComponentes += 1;
        else r.listoParaCobrar += 1;
      }
    }
    if (f.cantidadPm == null) {
      r.fueraDelPm += 1;
      continue;
    }
    // Los componentes no suman en las barras: su mueble padre ya cuenta la cantidad.
    if (!f.esComponente) {
      r.modelos += 1;
      r.piezasPm += f.cantidadPm;
    }
    let excedido = false;
    for (const a of AREAS_COBRO) {
      const base = baseArea(f, a) ?? 0;
      if (!f.esComponente) {
        r.avance[a].base += base;
        r.avance[a].cobrado += Math.min(f[a], base);
      }
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
  // Desde el cuadre con Calidad; faltan si la migración aún no está en la base.
  es_componente?: boolean | null;
  item_codigo?: string | null;
  material?: string | null;
  padre_modelo?: string | null;
  aprobado_acabados?: number | null;
  aprobado_armado?: number | null;
  // Desde los procesos repetidos de la ruta; faltan si la migración aún no está en la base.
  cantidad_pm_acabados?: number | null;
  cantidad_pm_armado?: number | null;
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
        cantidadPmAcabados: r.cantidad_pm_acabados == null ? null : Number(r.cantidad_pm_acabados),
        cantidadPmArmado: r.cantidad_pm_armado == null ? null : Number(r.cantidad_pm_armado),
        acabados: Number(r.acabados),
        armado: Number(r.armado),
        electrificacion: Number(r.electrificacion),
        reprocesos: Number(r.reprocesos),
        discrepanciasPendientes: Number(r.discrepancias_pendientes),
        esComponente: r.es_componente === true,
        itemCodigo: r.item_codigo ?? null,
        material: r.material ?? null,
        padreModelo: r.padre_modelo ?? null,
        aprobadoAcabados: r.aprobado_acabados == null ? null : Number(r.aprobado_acabados),
        aprobadoArmado: r.aprobado_armado == null ? null : Number(r.aprobado_armado),
      });
    }
    if (pagina.length < PAGINA) return { filas, error: null };
  }
}
