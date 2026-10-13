// Calidad por equipo: qué tan seguido lo que entrega cada equipo se rechaza,
// primero en la revisión del trabajador de Producción y luego en Calidad, y
// qué defectos son los más comunes. Sirve para decidir a quién asignar.
// Puro: la pantalla y las pruebas comparten el cálculo.

export interface EntregaParaMetricas {
  id: string;
  asignacion_id: string;
  cantidad: number;
  verificada_en: string | null;
  rechazada_en: string | null;
  anulada_en: string | null;
}

export interface AsignacionParaMetricas {
  id: string;
  equipo_id: string;
}

export interface InformeParaMetricas {
  entrega_id: string;
  aprobado: boolean;
  cantidad: number;
  categoria: string | null;
}

export interface MetricasEquipo {
  equipoId: string;
  // Piezas que el equipo entregó (sin las anuladas por error de captura).
  entregadas: number;
  // Revisión del trabajador de Producción.
  verificadas: number;
  rechazadasProduccion: number;
  // Evaluación de Calidad (por lote).
  evaluadas: number;
  aprobadas: number;
  rechazadasCalidad: number;
  // Fracción (0–1); null si todavía no hay nada revisado.
  rechazoInterno: number | null;
  rechazoCalidad: number | null;
  // Piezas rechazadas por Calidad por tipo de defecto, de más a menos.
  defectos: { categoria: string | null; piezas: number }[];
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function metricasPorEquipo(
  entregas: EntregaParaMetricas[],
  asignaciones: AsignacionParaMetricas[],
  informes: InformeParaMetricas[]
): MetricasEquipo[] {
  const equipoDe = new Map(asignaciones.map((a) => [a.id, a.equipo_id]));
  const equipoDeEntrega = new Map<string, string>();
  const porEquipo = new Map<string, MetricasEquipo & { _defectos: Map<string | null, number> }>();
  const de = (equipoId: string) => {
    let m = porEquipo.get(equipoId);
    if (!m) {
      m = {
        equipoId,
        entregadas: 0,
        verificadas: 0,
        rechazadasProduccion: 0,
        evaluadas: 0,
        aprobadas: 0,
        rechazadasCalidad: 0,
        rechazoInterno: null,
        rechazoCalidad: null,
        defectos: [],
        _defectos: new Map(),
      };
      porEquipo.set(equipoId, m);
    }
    return m;
  };

  for (const e of entregas) {
    if (e.anulada_en) continue;
    const equipoId = equipoDe.get(e.asignacion_id);
    if (!equipoId) continue;
    equipoDeEntrega.set(e.id, equipoId);
    const m = de(equipoId);
    const n = Number(e.cantidad);
    m.entregadas += n;
    if (e.rechazada_en) m.rechazadasProduccion += n;
    else if (e.verificada_en) m.verificadas += n;
  }

  for (const i of informes) {
    const equipoId = equipoDeEntrega.get(i.entrega_id);
    if (!equipoId) continue;
    const m = de(equipoId);
    const n = Number(i.cantidad);
    m.evaluadas += n;
    if (i.aprobado) m.aprobadas += n;
    else {
      m.rechazadasCalidad += n;
      m._defectos.set(i.categoria, (m._defectos.get(i.categoria) ?? 0) + n);
    }
  }

  return [...porEquipo.values()].map(({ _defectos, ...m }) => {
    const revisadas = m.verificadas + m.rechazadasProduccion;
    return {
      ...m,
      entregadas: redondear(m.entregadas),
      verificadas: redondear(m.verificadas),
      rechazadasProduccion: redondear(m.rechazadasProduccion),
      evaluadas: redondear(m.evaluadas),
      aprobadas: redondear(m.aprobadas),
      rechazadasCalidad: redondear(m.rechazadasCalidad),
      rechazoInterno: revisadas > 0 ? m.rechazadasProduccion / revisadas : null,
      rechazoCalidad: m.evaluadas > 0 ? m.rechazadasCalidad / m.evaluadas : null,
      defectos: [..._defectos]
        .map(([categoria, piezas]) => ({ categoria, piezas: redondear(piezas) }))
        .sort((a, b) => b.piezas - a.piezas),
    };
  });
}

// "12 %" o "—" si no hay datos.
export function porcentaje(fraccion: number | null): string {
  if (fraccion === null) return "—";
  return `${Math.round(fraccion * 100)} %`;
}

// Periodos de la pantalla: desde cuándo se cuentan las entregas.
export const PERIODOS = [
  { valor: "30", etiqueta: "Últimos 30 días", dias: 30 },
  { valor: "90", etiqueta: "Últimos 90 días", dias: 90 },
  { valor: "todo", etiqueta: "Todo", dias: null },
] as const;
export type Periodo = (typeof PERIODOS)[number]["valor"];

export function leerPeriodo(valor: unknown): Periodo {
  return PERIODOS.some((p) => p.valor === valor) ? (valor as Periodo) : "90";
}

// Primer día del periodo ("AAAA-MM-DD") o null para "todo".
export function inicioPeriodo(periodo: Periodo, hoy: string): string | null {
  const p = PERIODOS.find((x) => x.valor === periodo);
  if (!p || p.dias === null) return null;
  const [a, m, d] = hoy.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - (p.dias - 1))).toISOString().slice(0, 10);
}
