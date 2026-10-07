// Números del panel de Calidad: qué falta por evaluar, qué lleva demasiado
// esperando, qué se rechazó y sigue sin reinspección, y cuánto se aprueba.
// Puro; la lectura de la base está en resumen-db.ts.

import { DIAS_ANTIGUEDAD_ALERTA } from "./estado-item";

export interface ItemLiberado {
  id: string;
  pedidoId: string;
  liberadoEn: string | null;
}

export interface InformeBasico {
  itemId: string;
  aprobado: boolean;
  elaboradoEn: string;
}

export interface ResumenPedidoCalidad {
  // Ítems enviados a producción (vigentes) y cuántos tienen al menos un informe.
  liberados: number;
  evaluados: number;
  porEvaluar: number;
  // Cuyo último informe fue "No aprobado": esperan reinspección.
  porReinspeccionar: number;
  // Sin evaluar desde hace más de DIAS_ANTIGUEDAD_ALERTA días.
  antiguos: number;
}

export interface ResumenCalidad extends ResumenPedidoCalidad {
  // Días que lleva esperando el ítem sin evaluar más antiguo (null si no hay).
  masAntiguoDias: number | null;
  // Aprobados / evaluaciones de los últimos 30 días, en % (null sin evaluaciones).
  tasaAprobacion: number | null;
  evaluaciones30d: number;
  porPedido: Map<string, ResumenPedidoCalidad>;
}

const DIA_MS = 86_400_000;

export function resumirCalidad(
  items: ItemLiberado[],
  informes: InformeBasico[],
  ahora: Date
): ResumenCalidad {
  // Último informe de cada ítem.
  const ultimo = new Map<string, InformeBasico>();
  for (const inf of informes) {
    const previo = ultimo.get(inf.itemId);
    if (!previo || inf.elaboradoEn > previo.elaboradoEn) ultimo.set(inf.itemId, inf);
  }

  const porPedido = new Map<string, ResumenPedidoCalidad>();
  let evaluados = 0;
  let porEvaluar = 0;
  let porReinspeccionar = 0;
  let antiguos = 0;
  let masAntiguoDias: number | null = null;

  for (const item of items) {
    const r = porPedido.get(item.pedidoId) ?? {
      liberados: 0,
      evaluados: 0,
      porEvaluar: 0,
      porReinspeccionar: 0,
      antiguos: 0,
    };
    r.liberados += 1;
    const inf = ultimo.get(item.id);
    if (inf) {
      r.evaluados += 1;
      evaluados += 1;
    }
    if (!inf) {
      r.porEvaluar += 1;
      porEvaluar += 1;
      if (item.liberadoEn) {
        const dias = Math.max(0, Math.floor((ahora.getTime() - new Date(item.liberadoEn).getTime()) / DIA_MS));
        if (dias >= DIAS_ANTIGUEDAD_ALERTA) {
          r.antiguos += 1;
          antiguos += 1;
        }
        if (masAntiguoDias === null || dias > masAntiguoDias) masAntiguoDias = dias;
      }
    } else if (!inf.aprobado) {
      r.porReinspeccionar += 1;
      porReinspeccionar += 1;
    }
    porPedido.set(item.pedidoId, r);
  }

  const desde = ahora.getTime() - 30 * DIA_MS;
  const recientes = informes.filter((i) => new Date(i.elaboradoEn).getTime() >= desde);
  const aprobados = recientes.filter((i) => i.aprobado).length;

  return {
    liberados: items.length,
    evaluados,
    porEvaluar,
    porReinspeccionar,
    antiguos,
    masAntiguoDias,
    evaluaciones30d: recientes.length,
    tasaAprobacion: recientes.length ? Math.round((aprobados / recientes.length) * 100) : null,
    porPedido,
  };
}

// Texto corto para la tarjeta "por evaluar".
export function detallePorEvaluar(r: ResumenCalidad): string {
  if (r.porEvaluar === 0) return "todo lo liberado está evaluado";
  const partes: string[] = [];
  if (r.antiguos > 0) partes.push(`${r.antiguos} con ${DIAS_ANTIGUEDAD_ALERTA} días o más`);
  if (r.masAntiguoDias !== null && r.masAntiguoDias >= 1) {
    partes.push(`el más antiguo espera ${r.masAntiguoDias} día${r.masAntiguoDias === 1 ? "" : "s"}`);
  }
  return partes.length ? partes.join(" · ") : "recién liberados";
}
