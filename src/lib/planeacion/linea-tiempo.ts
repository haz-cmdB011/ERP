// Seguimiento de un PM de punta a punta, para que Planeación vea qué pasó con lo
// que planeó: planeado → liberado a Producción → asignado a equipos → entregado
// → evaluado por Calidad. Se calcula sobre la versión activa, con los ítems
// vigentes (sin cancelar ni en la papelera de Producción).
//
// "Asignado" y "entregado" se cuentan por mueble liberado y por proceso (armado,
// barniz): un mueble cuenta cuando la suma de sus asignaciones (o entregas)
// alcanza su cantidad total. No se suman piezas entre muebles porque sus
// unidades pueden ser distintas.

import { PROCESOS, type Proceso } from "@/lib/produccion/asignaciones";

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
  proceso: Proceso;
  cantidad: number;
  entregado: number;
  cancelada_en: string | null;
}

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
  idsConInforme: ReadonlySet<string>
): LineaTiempo {
  const vigentes = items.filter((i) => i.estado_revision !== "cancelado" && !i.eliminacion_solicitada_en);
  const liberados = vigentes.filter((i) => i.estado_liberacion === "enviado_a_produccion");
  const mueblesLiberados = liberados.filter((i) => i.tipo_registro === "MO");

  // Asignado y entregado por mueble y proceso (sin contar lo cancelado).
  const asignadoPor = new Map<string, number>();
  const entregadoPor = new Map<string, number>();
  for (const a of asignaciones) {
    if (a.cancelada_en || !a.planeacion_item_id) continue;
    const clave = `${a.planeacion_item_id}|${a.proceso}`;
    asignadoPor.set(clave, (asignadoPor.get(clave) ?? 0) + Number(a.cantidad));
    entregadoPor.set(clave, (entregadoPor.get(clave) ?? 0) + Number(a.entregado));
  }

  const contar = (porClave: Map<string, number>, proceso: Proceso): number =>
    mueblesLiberados.filter(
      (m) => (porClave.get(`${m.id}|${proceso}`) ?? 0) + TOLERANCIA >= Number(m.cantidad_total)
    ).length;

  return {
    muebles: vigentes.filter((i) => i.tipo_registro === "MO").length,
    componentes: vigentes.filter((i) => i.tipo_registro === "FU").length,
    itemsVigentes: vigentes.length,
    itemsLiberados: liberados.length,
    mueblesLiberados: mueblesLiberados.length,
    asignados: Object.fromEntries(PROCESOS.map((p) => [p, contar(asignadoPor, p)])) as Record<Proceso, number>,
    entregados: Object.fromEntries(PROCESOS.map((p) => [p, contar(entregadoPor, p)])) as Record<Proceso, number>,
    evaluados: liberados.filter((i) => idsConInforme.has(i.id)).length,
  };
}
