// Pista de procesos de un mueble en Calidad: una estación por paso de su ruta (Armado →
// Barniz → Electrificación…), con lo que Calidad aprobó, lo que falta revisar, lo que está en
// retrabajo y los folios de cada una. Así se ve de qué proceso es cada entrega y qué ya se
// aprobó, en vez de un total de piezas que suma procesos distintos. Solo pantalla.

import { PROCESO_LABELS, PROCESOS, type Proceso } from "@/lib/produccion/asignaciones";
import type { PasoRuta } from "@/lib/produccion/ruta";
import { resumirLotes, type LoteCalidad } from "./lotes";

export type EstadoEstacion = "aprobado" | "por_revisar" | "en_retrabajo" | "en_curso" | "sin_entregar";

export interface InformePista {
  id: string;
  folio: string;
  aprobado: boolean;
  cantidad: number | null;
  elaborado_en: string;
  entrega_id?: string | null;
  entrega_parte_id?: string | null;
}

export interface PartePista {
  descripcion: string;
  // Piezas de la parte para todos los muebles (piezas por mueble × cantidad del mueble).
  meta: number;
  aprobadas: number;
  porRevisar: number;
  enRetrabajo: number;
}

export interface EstacionPista {
  clave: string;
  proceso: Proceso;
  etiqueta: string;
  // Muebles: la cantidad del mueble en el PM.
  meta: number;
  aprobadas: number;
  porRevisar: number;
  enRetrabajo: number;
  // Lo que Producción ya entregó (muebles o, por partes, lo que alcanza la parte más atrasada).
  entregadas: number;
  partes: PartePista[];
  informes: (InformePista & { parte: string | null })[];
  // Entregas de esta estación con piezas por revisar.
  pendientes: LoteCalidad[];
  estado: EstadoEstacion;
}

export interface PistaMueble {
  estaciones: EstacionPista[];
  // Todas las estaciones aprobadas completas.
  completo: boolean;
  // Folios del mueble que no se ligan a ninguna entrega (evaluaciones de antes).
  sueltos: InformePista[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const clave = (proceso: Proceso, vez: number) => `${proceso}:${vez}`;

function esDeParte(l: Pick<LoteCalidad, "parte_id" | "entrega_parte">): boolean {
  return !!l.entrega_parte || !!l.parte_id;
}

function estadoDe(e: Pick<EstacionPista, "aprobadas" | "porRevisar" | "enRetrabajo" | "entregadas" | "meta">, hayPiezas: boolean): EstadoEstacion {
  if (e.porRevisar > 0) return "por_revisar";
  if (e.enRetrabajo > 0) return "en_retrabajo";
  if (e.meta > 0 && e.aprobadas >= e.meta) return "aprobado";
  if (e.entregadas > 0 || e.aprobadas > 0 || hayPiezas) return "en_curso";
  return "sin_entregar";
}

// Estaciones en el orden de la ruta: la del mueble o, si está vacía (muebles que se asignan
// por partes), la de sus partes juntas. Lo entregado en un proceso que la ruta ya no tiene
// se agrega al final para que no se pierda.
export function pistaDeProcesos(
  lotes: LoteCalidad[],
  informes: InformePista[],
  pasosMueble: PasoRuta[],
  pasosPartes: PasoRuta[][],
  cantidadMueble: number
): PistaMueble {
  const orden: { proceso: Proceso; vez: number }[] = [];
  const vistos = new Set<string>();
  function agregar(proceso: Proceso, vez: number) {
    const k = clave(proceso, vez);
    if (vistos.has(k)) return;
    vistos.add(k);
    orden.push({ proceso, vez });
  }
  const rutas = pasosMueble.length > 0 ? [pasosMueble] : pasosPartes;
  for (const ruta of rutas) {
    const cuenta = new Map<Proceso, number>();
    for (const p of ruta) {
      const vez = (cuenta.get(p.proceso) ?? 0) + 1;
      cuenta.set(p.proceso, vez);
      agregar(p.proceso, vez);
    }
  }
  const sobrantes = lotes
    .map((l) => ({ proceso: l.proceso, vez: l.vez_paso ?? 1 }))
    .filter((x) => !vistos.has(clave(x.proceso, x.vez)))
    .sort((a, b) => PROCESOS.indexOf(a.proceso) - PROCESOS.indexOf(b.proceso) || a.vez - b.vez);
  for (const x of sobrantes) agregar(x.proceso, x.vez);

  const veces = new Map<Proceso, number>();
  for (const o of orden) veces.set(o.proceso, Math.max(veces.get(o.proceso) ?? 0, o.vez));

  const porEstacion = new Map<string, LoteCalidad[]>();
  const estacionDeEntrega = new Map<string, { k: string; parte: string | null }>();
  for (const l of lotes) {
    const k = clave(l.proceso, l.vez_paso ?? 1);
    porEstacion.set(k, [...(porEstacion.get(k) ?? []), l]);
    estacionDeEntrega.set(l.entrega_id, { k, parte: esDeParte(l) ? (l.parte_descripcion ?? null) : null });
  }

  const informesPorEstacion = new Map<string, (InformePista & { parte: string | null })[]>();
  const sueltos: InformePista[] = [];
  for (const inf of informes) {
    const id = inf.entrega_parte_id ?? inf.entrega_id ?? null;
    const destino = id ? estacionDeEntrega.get(id) : undefined;
    if (!destino) {
      sueltos.push(inf);
      continue;
    }
    informesPorEstacion.set(destino.k, [...(informesPorEstacion.get(destino.k) ?? []), { ...inf, parte: destino.parte }]);
  }

  const estaciones = orden.map(({ proceso, vez }): EstacionPista => {
    const k = clave(proceso, vez);
    const deEstacion = porEstacion.get(k) ?? [];
    const delMueble = resumirLotes(deEstacion.filter((l) => !esDeParte(l)));

    // Las piezas de cada parte: cuentan muebles cuando la parte más atrasada alcanza.
    const porParte = new Map<string, LoteCalidad[]>();
    for (const l of deEstacion.filter(esDeParte)) {
      const nombre = l.parte_descripcion ?? "Parte";
      porParte.set(nombre, [...(porParte.get(nombre) ?? []), l]);
    }
    const conteoPartes = [...porParte].map(([descripcion, ls]) => {
      const rr = resumirLotes(ls);
      const ppm = Number(ls[0].parte_piezas_por_mueble ?? 1) || 1;
      return {
        ppm,
        // Entregado sin contar lo rechazado que aún no regresa.
        entregadas: rr.verificadas - rr.rechazadas,
        parte: {
          descripcion,
          meta: r2(ppm * cantidadMueble),
          aprobadas: rr.aprobadas,
          porRevisar: rr.porEvaluar,
          enRetrabajo: rr.enRetrabajo,
        } satisfies PartePista,
      };
    });
    // Muebles que alcanza la parte más atrasada (solo entre las que ya tienen entregas).
    const muebles = (valor: (c: (typeof conteoPartes)[number]) => number) =>
      conteoPartes.length === 0 ? 0 : Math.min(...conteoPartes.map((c) => Math.floor(valor(c) / c.ppm)));
    const aprobadasPartes = muebles((c) => c.parte.aprobadas);
    const entregadasPartes = muebles((c) => c.entregadas);
    const partesLimpias = conteoPartes.map((c) => c.parte);

    const meta = cantidadMueble;
    const base = {
      meta,
      aprobadas: Math.min(meta, r2(delMueble.aprobadas + aprobadasPartes)),
      porRevisar: delMueble.porEvaluar,
      enRetrabajo: delMueble.enRetrabajo,
      entregadas: Math.min(meta, r2(delMueble.verificadas - delMueble.rechazadas + entregadasPartes)),
    };
    const partesPendientes = partesLimpias.some((p) => p.porRevisar > 0);
    const partesRetrabajo = partesLimpias.some((p) => p.enRetrabajo > 0);
    const estado =
      base.porRevisar > 0 || partesPendientes
        ? "por_revisar"
        : base.enRetrabajo > 0 || partesRetrabajo
          ? "en_retrabajo"
          : estadoDe(base, partesLimpias.length > 0);
    const etiqueta = (veces.get(proceso) ?? 1) > 1 ? `${PROCESO_LABELS[proceso]} ${vez}` : PROCESO_LABELS[proceso];
    return {
      clave: k,
      proceso,
      etiqueta,
      ...base,
      partes: partesLimpias,
      informes: (informesPorEstacion.get(k) ?? []).sort((a, b) => b.elaborado_en.localeCompare(a.elaborado_en)),
      pendientes: deEstacion
        .filter((l) => l.vigente && l.pendiente > 0)
        .sort((a, b) => a.verificada_en.localeCompare(b.verificada_en)),
      estado,
    };
  });

  return {
    estaciones,
    completo: estaciones.length > 0 && estaciones.every((e) => e.estado === "aprobado"),
    sueltos,
  };
}
