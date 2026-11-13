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
// mueble (sus asignaciones van en piezas). Solo el id = 1 pieza por mueble. Un mueble que
// no aparece cuenta las partes que ya tienen asignaciones.
export interface ParteTiempo {
  id: string;
  piezasPorMueble: number;
}
export type PartesPorMueble = ReadonlyMap<string, readonly (string | ParteTiempo)[]>;

// Pasos vigentes de las rutas guardadas de cada mueble, en orden: los del mueble completo
// (parteId null u omitido) y los de cada parte, que tiene su propia ruta (migración
// rutas_por_parte). Un mueble sin ruta guardada cuenta un paso por proceso.
export type PasosPorMueble = ReadonlyMap<
  string,
  readonly { id: string; proceso: string; parteId?: string | null }[]
>;

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

  const vigentesAsig = asignaciones.filter(
    (a) => !a.cancelada_en && a.planeacion_item_id && !a.informe_rechazo_id && !a.revision_final_rechazo_id
  );
  const partesDe = (itemId: string): ParteTiempo[] =>
    (
      partes.get(itemId) ??
      [...new Set(vigentesAsig.flatMap((a) => (a.planeacion_item_id === itemId && a.parte_id ? [a.parte_id] : [])))]
    ).map((p) => (typeof p === "string" ? { id: p, piezasPorMueble: 1 } : p));
  const conRuta = (itemId: string) => (pasos.get(itemId)?.length ?? 0) > 0;

  // Los pasos de un proceso en la ruta de su dueño (el mueble completo, parte "", o una
  // parte); sin ruta guardada, uno por proceso (con clave del proceso).
  const pasosDe = (itemId: string, parte: string, proceso: string): string[] => {
    if (!conRuta(itemId)) return [`proceso:${proceso}`];
    return (pasos.get(itemId) ?? [])
      .filter((p) => (p.parteId ?? "") === parte && p.proceso === proceso)
      .map((p) => p.id);
  };

  // Asignado y entregado por mueble, dueño y paso (sin lo cancelado ni los retrabajos), en
  // muebles (lo de una parte, sus piezas ÷ piezas por mueble). Una asignación cuyo paso no
  // está en la ruta va al primer paso de su proceso.
  const piezasPor = (itemId: string, parte: string) =>
    partesDe(itemId).find((p) => p.id === parte)?.piezasPorMueble ?? 1;
  const asignadoPor = new Map<string, number>();
  const entregadoPor = new Map<string, number>();
  for (const a of vigentesAsig) {
    const itemId = a.planeacion_item_id as string;
    const parte = a.parte_id ?? "";
    const delProceso = pasosDe(itemId, parte, a.proceso);
    const paso = a.paso_id && delProceso.includes(a.paso_id) ? a.paso_id : delProceso[0];
    if (!paso) continue;
    const clave = `${itemId}|${parte}|${paso}`;
    const ppm = parte ? piezasPor(itemId, parte) : 1;
    asignadoPor.set(clave, (asignadoPor.get(clave) ?? 0) + Number(a.cantidad) / ppm);
    entregadoPor.set(clave, (entregadoPor.get(clave) ?? 0) + Number(a.entregado) / ppm);
  }

  // Un mueble cuenta en un proceso cuando cada paso del mueble completo con ese proceso y,
  // en sus partes, cada vez que lo llevan (la parte más atrasada, como cobertura_partes_vez
  // en la base) alcanzan su cantidad. Sin ruta guardada, lo del mueble completo más la parte
  // más atrasada.
  // Lo de una parte pasado a muebles se trunca a dos decimales, como en la base.
  const enMuebles = (porClave: Map<string, number>, itemId: string, parte: string, paso: string) => {
    const n = porClave.get(`${itemId}|${parte}|${paso}`) ?? 0;
    return parte ? Math.floor(n * 100 + 1e-9) / 100 : n;
  };
  const contar = (porClave: Map<string, number>, proceso: Proceso): number =>
    mueblesLiberados.filter((m) => {
      const cantidad = Number(m.cantidad_total);
      const alcanza = (n: number) => n + TOLERANCIA >= cantidad;
      const ps = partesDe(m.id);
      if (!conRuta(m.id)) {
        const clave = `proceso:${proceso}`;
        const minimo = ps.length ? Math.min(...ps.map((p) => enMuebles(porClave, m.id, p.id, clave))) : 0;
        return alcanza(enMuebles(porClave, m.id, "", clave) + minimo);
      }
      const requisitos = pasosDe(m.id, "", proceso).map((paso) => enMuebles(porClave, m.id, "", paso));
      const veces = ps.map((p) => ({ p, pasos: pasosDe(m.id, p.id, proceso) }));
      for (let vez = 0; veces.some((x) => vez < x.pasos.length); vez++) {
        requisitos.push(
          Math.min(...veces.filter((x) => vez < x.pasos.length).map((x) => enMuebles(porClave, m.id, x.p.id, x.pasos[vez])))
        );
      }
      return requisitos.length > 0 && requisitos.every(alcanza);
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
