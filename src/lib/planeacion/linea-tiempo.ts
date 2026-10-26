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
  // Parte del despiece (migración despiece_por_partes); null si es el mueble completo.
  parte_id?: string | null;
}

// Partes vigentes del despiece de cada mueble: su id o, con sus datos, las piezas por
// mueble (sus asignaciones van en piezas) y los procesos que se salta (migración
// partes_en_piezas_y_ruta_por_parte). Solo el id = 1 pieza por mueble, todos los
// procesos. Un mueble que no aparece cuenta las partes que ya tienen asignaciones.
export interface ParteTiempo {
  id: string;
  piezasPorMueble: number;
  procesosOmitidos?: readonly string[];
}
export type PartesPorMueble = ReadonlyMap<string, readonly (string | ParteTiempo)[]>;

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
  pasos: PasosPorMueble = new Map(),
  partes: PartesPorMueble = new Map()
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
  // Por partes, cuenta lo del mueble completo más la parte más atrasada (como
  // cobertura_por_partes en la base): un mueble está asignado cuando todas sus partes.
  const vigentesAsig = asignaciones.filter(
    (a) => !a.cancelada_en && a.planeacion_item_id && !a.informe_rechazo_id && !a.revision_final_rechazo_id
  );
  const partesDe = (itemId: string): ParteTiempo[] =>
    (
      partes.get(itemId) ??
      [...new Set(vigentesAsig.flatMap((a) => (a.planeacion_item_id === itemId && a.parte_id ? [a.parte_id] : [])))]
    ).map((p) => (typeof p === "string" ? { id: p, piezasPorMueble: 1 } : p));
  // Las partes que pasan por el proceso.
  const partesDelProceso = (itemId: string, proceso: string) =>
    partesDe(itemId).filter((p) => !(p.procesosOmitidos ?? []).includes(proceso));
  const sumaPor = new Map<
    string,
    { proceso: string; mueble: { a: number; e: number }; partes: Map<string, { a: number; e: number }> }
  >();
  for (const a of vigentesAsig) {
    const itemId = a.planeacion_item_id as string;
    const delProceso = pasosDe(itemId, a.proceso);
    const paso = a.paso_id && delProceso.includes(a.paso_id) ? a.paso_id : delProceso[0];
    if (!paso) continue;
    const clave = `${itemId}|${paso}`;
    const s = sumaPor.get(clave) ?? { proceso: a.proceso, mueble: { a: 0, e: 0 }, partes: new Map() };
    const destino = a.parte_id ? (s.partes.get(a.parte_id) ?? { a: 0, e: 0 }) : s.mueble;
    destino.a += Number(a.cantidad);
    destino.e += Number(a.entregado);
    if (a.parte_id) s.partes.set(a.parte_id, destino);
    sumaPor.set(clave, s);
  }
  const asignadoPor = new Map<string, number>();
  const entregadoPor = new Map<string, number>();
  for (const [clave, s] of sumaPor) {
    // Cada parte en muebles (sus piezas ÷ piezas por mueble), solo las que llevan el proceso.
    const ps = partesDelProceso(clave.split("|")[0], s.proceso);
    const minimo = (campo: "a" | "e") =>
      ps.length
        ? Math.floor(Math.min(...ps.map((p) => (s.partes.get(p.id)?.[campo] ?? 0) / p.piezasPorMueble)) * 100 + 1e-9) / 100
        : 0;
    asignadoPor.set(clave, s.mueble.a + minimo("a"));
    entregadoPor.set(clave, s.mueble.e + minimo("e"));
  }

  const contar = (porClave: Map<string, number>, proceso: Proceso): number =>
    mueblesLiberados.filter((m) => {
      const delProceso = pasosDe(m.id, proceso);
      // Con despiece, si ninguna parte pasa por el proceso, ese paso no les aplica.
      if (delProceso.length > 0 && partesDe(m.id).length > 0 && partesDelProceso(m.id, proceso).length === 0) return true;
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
