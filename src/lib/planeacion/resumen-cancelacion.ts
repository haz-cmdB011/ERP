// Qué se cancela al cancelar un PM completo (RPC cancelar_pedido): todos sus
// ítems. Aquí se cuentan los vigentes de la versión activa para decirlo antes de
// que la persona confirme; los que ya estaban cancelados o en la papelera de
// Producción no cuentan.

export interface ItemParaCancelar {
  tipo_registro: "MO" | "FU";
  estado_liberacion: string;
  estado_revision: string | null;
  eliminacion_solicitada_en: string | null;
}

export interface ResumenCancelacion {
  muebles: number;
  componentes: number;
  // De los anteriores, cuántos ya están liberados a Producción.
  liberados: number;
}

export function resumirCancelacion(items: ItemParaCancelar[]): ResumenCancelacion {
  const r: ResumenCancelacion = { muebles: 0, componentes: 0, liberados: 0 };
  for (const i of items) {
    if (i.estado_revision === "cancelado" || i.eliminacion_solicitada_en) continue;
    if (i.tipo_registro === "MO") r.muebles += 1;
    else r.componentes += 1;
    if (i.estado_liberacion === "enviado_a_produccion") r.liberados += 1;
  }
  return r;
}

function cantidad(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

// "Se cancelarán 12 muebles y 48 componentes; 5 ya están liberados a Producción."
export function textoCancelacion(r: ResumenCancelacion): string {
  const total = r.muebles + r.componentes;
  if (total === 0) return "Este pedido no tiene ítems vigentes que cancelar.";
  const partes = [];
  if (r.muebles) partes.push(cantidad(r.muebles, "mueble", "muebles"));
  if (r.componentes) partes.push(cantidad(r.componentes, "componente", "componentes"));
  const base = `${total === 1 ? "Se cancelará" : "Se cancelarán"} ${partes.join(" y ")}`;
  const liberados = r.liberados
    ? `; ${r.liberados === 1 ? "1 ya está liberado" : `${r.liberados} ya están liberados`} a Producción`
    : "";
  return `${base}${liberados}.`;
}
