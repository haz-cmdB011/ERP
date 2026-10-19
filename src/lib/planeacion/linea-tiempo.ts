// Seguimiento de un PM de punta a punta, para que Planeación vea qué pasó con lo
// que planeó: planeado → liberado a Producción → asignado a equipos → entregado
// → evaluado por Calidad. Se calcula sobre la versión activa, con los ítems
// vigentes (sin cancelar ni en la papelera de Producción).
//
// "Asignado" y "entregado" se cuentan por mueble liberado y por proceso (armado,
// barniz): un mueble cuenta cuando, en CADA paso de su ruta con ese proceso, la
// suma de sus asignaciones (o entregas) alcanza su cantidad total (Armado →
// Barniz → Armado cuenta el armado hasta terminar la segunda pasada). Los
// retrabajos no cuentan. No se suman piezas entre muebles porque sus unidades
// pueden ser distintas.

// La línea de tiempo sigue solo armado y barniz: Electrificación aplica a una parte de los
// muebles (los de iluminación) y Superficie Sólida no tiene un total contra el cual contar.
export const PROCESOS_LINEA_TIEMPO = ["armado", "barniz"] as const;
type Proceso = (typeof PROCESOS_LINEA_TIEMPO)[number];
type ProcesoAsignacion = string;

export interface ItemTiempo {
  id: string;
  tipo_registro: "MO" | "FU";
  cantidad_total: number;
  estado_liberacion: string;
  estado_revision: string | null;
  eliminacion_solicitada_en: string | null;
}

export interface AsignacionTiempo {
  planeacion_item_id: string | null;
  proceso: ProcesoAsignacion;
  cantidad: number;
  entregado: number;
  cancelada_en: string | null;
  // Paso de la ruta y si es retrabajo (de un lote o de la revisión final).
  paso_id?: string | null;
  informe_rechazo_id?: string | null;
  revision_final_rechazo_id?: string | null;
}

// Pasos vigentes de la ruta guardada de cada mueble, en orden. Un mueble sin
// ruta guardada cuenta un paso por proceso.
export type PasosPorMueble = ReadonlyMap<string, readonly { id: string; proceso: string }[]>;

export interface LineaTiempo {
  muebles: number;
  componentes: number;
  itemsVigentes: number;
  itemsLiberados: number;
  mueblesLiberados: number;
  // Muebles liberados con todo asignado / entregado, por proceso.
  asignados: Record<Proceso, number>;
  entregados: Record<Proceso, number>;
  // Ítems liberados con al menos un informe de Calidad.
  evaluados: number;
}

const TOLERANCIA = 0.005;

export function armarLineaTiempo(
  items: ItemTiempo[],
  asignaciones: AsignacionTiempo[],
  idsConInforme: ReadonlySet<string>,
  pasos: PasosPorMueble = new Map()
): LineaTiempo {
  const vigentes = items.filter((i) => i.estado_revision !== "cancelado" && !i.eliminacion_solicitada_en);
  const liberados = vigentes.filter((i) => i.estado_liberacion === "enviado_a_produccion");
  const mueblesLiberados = liberados.filter((i) => i.tipo_registro === "MO");

  // Los pasos de cada proceso en la ruta del mueble; sin ruta guardada, uno por
  // proceso (con clave del proceso).
  const pasosDe = (itemId: string, proceso: string): string[] => {
    const ruta = pasos.get(itemId);
    if (!ruta || ruta.length === 0) return [`proceso:${proceso}`];
    return ruta.filter((p) => p.proceso === proceso).map((p) => p.id);
  };

  // Asignado y entregado por mueble y paso (sin lo cancelado ni los retrabajos).
  // Una asignación cuyo paso no está en la ruta va al primer paso de su proceso.
  const asignadoPor = new Map<string, number>();
  const entregadoPor = new Map<string, number>();
  for (const a of asignaciones) {
    if (a.cancelada_en || !a.planeacion_item_id || a.informe_rechazo_id || a.revision_final_rechazo_id) continue;
    const delProceso = pasosDe(a.planeacion_item_id, a.proceso);
    const paso = a.paso_id && delProceso.includes(a.paso_id) ? a.paso_id : delProceso[0];
    if (!paso) continue;
    const clave = `${a.planeacion_item_id}|${paso}`;
    asignadoPor.set(clave, (asignadoPor.get(clave) ?? 0) + Number(a.cantidad));
    entregadoPor.set(clave, (entregadoPor.get(clave) ?? 0) + Number(a.entregado));
  }

  const contar = (porClave: Map<string, number>, proceso: Proceso): number =>
    mueblesLiberados.filter((m) => {
      const delProceso = pasosDe(m.id, proceso);
      return (
        delProceso.length > 0 &&
        delProceso.every((p) => (porClave.get(`${m.id}|${p}`) ?? 0) + TOLERANCIA >= Number(m.cantidad_total))
      );
    }).length;

  return {
    muebles: vigentes.filter((i) => i.tipo_registro === "MO").length,
    componentes: vigentes.filter((i) => i.tipo_registro === "FU").length,
    itemsVigentes: vigentes.length,
    itemsLiberados: liberados.length,
    mueblesLiberados: mueblesLiberados.length,
    asignados: Object.fromEntries(PROCESOS_LINEA_TIEMPO.map((p) => [p, contar(asignadoPor, p)])) as Record<Proceso, number>,
    entregados: Object.fromEntries(PROCESOS_LINEA_TIEMPO.map((p) => [p, contar(entregadoPor, p)])) as Record<Proceso, number>,
    evaluados: liberados.filter((i) => idsConInforme.has(i.id)).length,
  };
}
