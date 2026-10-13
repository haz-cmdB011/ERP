// Dónde está un mueble en Producción mientras Calidad todavía no lo puede
// evaluar (no hay piezas preaprobadas por Producción). Antes la pantalla solo
// decía "En producción" y Calidad no sabía qué faltaba ni a quién preguntar.
// Solo funciones puras (la pantalla y las pruebas comparten la misma lógica).

// Lo necesario de una fila de asignaciones_produccion_resumen (vigente, es
// decir, sin cancelar). PostgREST devuelve numeric como texto.
export interface AsignacionDelMueble {
  planeacion_item_id: string | null;
  equipo: string;
  cantidad: number | string;
  entregado: number | string;
  por_verificar: number | string;
}

export type SituacionProduccion =
  | { tipo: "sin_asignar" }
  // Con uno o más equipos y sin piezas entregadas por preaprobar.
  | { tipo: "en_taller"; equipos: string[]; asignadas: number; entregadas: number }
  // Entregas registradas con la pantalla anterior (sin decidir si cumplen):
  // esperan que Producción las revise.
  | { tipo: "por_preaprobar"; piezas: number };

const redondear = (n: number) => Math.round(n * 100) / 100;

export function situacionDe(asignaciones: Omit<AsignacionDelMueble, "planeacion_item_id">[]): SituacionProduccion {
  if (asignaciones.length === 0) return { tipo: "sin_asignar" };
  const porPreaprobar = redondear(asignaciones.reduce((s, a) => s + Number(a.por_verificar), 0));
  if (porPreaprobar > 0) return { tipo: "por_preaprobar", piezas: porPreaprobar };
  return {
    tipo: "en_taller",
    equipos: [...new Set(asignaciones.map((a) => a.equipo))],
    asignadas: redondear(asignaciones.reduce((s, a) => s + Number(a.cantidad), 0)),
    entregadas: redondear(asignaciones.reduce((s, a) => s + Number(a.entregado), 0)),
  };
}

// Situación de cada mueble de la lista (los que no tienen asignaciones quedan
// "sin asignar").
export function situacionesPorMueble(
  muebleIds: string[],
  asignaciones: AsignacionDelMueble[]
): Map<string, SituacionProduccion> {
  const porMueble = new Map<string, AsignacionDelMueble[]>(muebleIds.map((id) => [id, []]));
  for (const a of asignaciones) {
    if (a.planeacion_item_id) porMueble.get(a.planeacion_item_id)?.push(a);
  }
  return new Map([...porMueble].map(([id, lista]) => [id, situacionDe(lista)]));
}

// Texto para Calidad: `corto` en la columna de estado, `detalle` junto a los
// botones de aprobar (deshabilitados) para saber qué falta y a quién preguntar.
// En un componente se aclara que es la situación de su mueble.
export function textoSituacion(
  s: SituacionProduccion,
  unidad: string | null,
  esComponente = false
): { corto: string; detalle: string } {
  const u = unidad ?? "pz";
  switch (s.tipo) {
    case "sin_asignar":
      return {
        corto: "Sin asignar",
        detalle: esComponente
          ? "Producción todavía no asigna su mueble a un equipo."
          : "Producción todavía no lo asigna a un equipo.",
      };
    case "por_preaprobar":
      return {
        corto: "Por preaprobar",
        detalle: `${esComponente ? "Su mueble tiene" : "Hay"} ${s.piezas} ${u} entregadas que esperan la preaprobación de Producción.`,
      };
    case "en_taller":
      return {
        corto: "En taller",
        detalle: `${esComponente ? "Su mueble está" : "Está"} con ${s.equipos.join(", ")}: ${s.entregadas} de ${s.asignadas} ${u} entregadas. Se evalúa cuando Producción registre la entrega.`,
      };
  }
}
