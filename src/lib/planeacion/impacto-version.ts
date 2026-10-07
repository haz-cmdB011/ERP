// Qué pasa con el trabajo en marcha cuando se carga una versión nueva de un PM.
//
// Cada carga crea ítems nuevos: nacen "pendientes" (la liberación a Producción
// no se copia), y las asignaciones, entregas e informes de Calidad quedan
// ligados a los ítems de la versión anterior. Los folios de producción son por
// ítem, así que al volver a liberar recibirán folios nuevos. Por eso, antes de
// cargar un Excel sobre un PM que ya tiene trabajo en marcha se avisa y se pide
// confirmar.

import type { PlaneacionItemParsed } from "./types";
import { compararVersiones, type ItemComparable, type ResumenCambios } from "./diff-versiones";

// Ítems del Excel con la forma que compara `compararVersiones`. El mueble (MO)
// de un componente (FU) es el de número igual a la parte entera del suyo, como
// lo asigna ingest_planeacion_version al guardarlos.
export function aComparables(items: PlaneacionItemParsed[]): ItemComparable[] {
  const idDe = (i: PlaneacionItemParsed) => `nuevo-${i.fila_excel_origen}`;
  const idMueble = new Map<number, string>();
  for (const i of items) if (i.tipo_registro === "MO") idMueble.set(i.item_code, idDe(i));
  return items.map((i) => ({
    id: idDe(i),
    parentId: i.tipo_registro === "FU" ? (idMueble.get(Math.floor(i.item_code)) ?? null) : null,
    itemCode: i.item_code,
    tipoRegistro: i.tipo_registro,
    modelo: i.modelo,
    descripcion: i.descripcion,
    tipoMaterial: i.tipo_material,
    etapa: i.etapa,
    nivel: i.nivel,
    departamento: i.departamento,
    elevacion: i.elevacion,
    cantidadXMueble: i.cantidad_x_mueble,
    unidad: i.unidad,
    cantidadTotal: i.cantidad_total,
    acabados: i.acabados,
    observaciones: i.observaciones,
    fila: i.fila_excel_origen,
  }));
}

// Lo que tiene un ítem de la versión activa en Producción y Calidad.
export interface EstadoItemEnMarcha {
  liberado: boolean;
  // Asignaciones vigentes (no canceladas) y cuántas de ellas ya tienen entregas.
  asignaciones: number;
  asignacionesConEntregas: number;
  informes: number;
}

export const SIN_TRABAJO: EstadoItemEnMarcha = {
  liberado: false,
  asignaciones: 0,
  asignacionesConEntregas: 0,
  informes: 0,
};

export interface TrabajoEnMarcha {
  itemsLiberados: number;
  mueblesLiberados: number;
  asignaciones: number;
  asignacionesConEntregas: number;
  // Ítems con al menos un informe de Calidad.
  itemsEvaluados: number;
}

export function necesitaConfirmacion(t: TrabajoEnMarcha): boolean {
  return t.itemsLiberados > 0 || t.asignaciones > 0 || t.itemsEvaluados > 0;
}

export interface ImpactoPm {
  hoja: string;
  numeroPedido: string;
  versionActiva: number;
  versionNueva: number;
  itemsNuevos: number;
  // El Excel no cambia nada respecto a la versión activa.
  igual: boolean;
  cambios: ResumenCambios;
  enMarcha: TrabajoEnMarcha;
  // De los muebles ya liberados: cuántos cambian y cuántos se quitan.
  mueblesLiberadosQueCambian: number;
  mueblesLiberadosQuitados: number;
  // Muebles con asignaciones vigentes que ya no están en el Excel.
  mueblesAsignadosQuitados: number;
}

export function calcularImpacto(args: {
  hoja: string;
  numeroPedido: string;
  versionActiva: number;
  versionNueva: number;
  // Ítems de la versión activa y los del Excel.
  antes: ItemComparable[];
  despues: ItemComparable[];
  // Estado de los ítems de la versión activa (los que no aparecen no tienen trabajo).
  estados: ReadonlyMap<string, EstadoItemEnMarcha>;
}): ImpactoPm {
  const { antes, despues, estados } = args;
  const estadoDe = (id: string) => estados.get(id) ?? SIN_TRABAJO;
  const { cambios, resumen } = compararVersiones(antes, despues);

  const enMarcha: TrabajoEnMarcha = {
    itemsLiberados: 0,
    mueblesLiberados: 0,
    asignaciones: 0,
    asignacionesConEntregas: 0,
    itemsEvaluados: 0,
  };
  for (const item of antes) {
    const e = estadoDe(item.id);
    if (e.liberado) {
      enMarcha.itemsLiberados += 1;
      if (item.tipoRegistro === "MO") enMarcha.mueblesLiberados += 1;
    }
    enMarcha.asignaciones += e.asignaciones;
    enMarcha.asignacionesConEntregas += e.asignacionesConEntregas;
    if (e.informes > 0) enMarcha.itemsEvaluados += 1;
  }

  const esMuebleLiberado = (c: { antes: ItemComparable | null }) =>
    !!c.antes && c.antes.tipoRegistro === "MO" && estadoDe(c.antes.id).liberado;
  const quitados = cambios.filter((c) => c.tipo === "quitado");

  return {
    hoja: args.hoja,
    numeroPedido: args.numeroPedido,
    versionActiva: args.versionActiva,
    versionNueva: args.versionNueva,
    itemsNuevos: despues.length,
    igual: cambios.length === 0,
    cambios: resumen,
    enMarcha,
    mueblesLiberadosQueCambian: cambios.filter((c) => c.tipo === "modificado" && esMuebleLiberado(c)).length,
    mueblesLiberadosQuitados: quitados.filter(esMuebleLiberado).length,
    mueblesAsignadosQuitados: quitados.filter((c) => !!c.antes && estadoDe(c.antes.id).asignaciones > 0).length,
  };
}

function cantidad(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

// "3 muebles modificados, 1 mueble agregado, 2 componentes con cambios".
export function describirCambios(r: ResumenCambios): string {
  const partes: string[] = [];
  if (r.mueblesModificados) partes.push(cantidad(r.mueblesModificados, "mueble modificado", "muebles modificados"));
  if (r.mueblesAgregados) partes.push(cantidad(r.mueblesAgregados, "mueble agregado", "muebles agregados"));
  if (r.mueblesQuitados) partes.push(cantidad(r.mueblesQuitados, "mueble quitado", "muebles quitados"));
  const componentes = r.componentesAgregados + r.componentesQuitados + r.componentesModificados;
  if (componentes) partes.push(cantidad(componentes, "componente con cambios", "componentes con cambios"));
  return partes.length ? partes.join(", ") : "Sin cambios";
}
