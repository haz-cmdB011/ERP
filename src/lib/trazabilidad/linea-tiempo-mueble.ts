// Línea de tiempo de un mueble padre para la ficha del QR (/q/<ítem>): todo lo que le
// pasó, de lo más reciente a lo más antiguo, con quién lo hizo. Junta lo que ya guarda
// cada área (liberación, hoja de viajero, asignaciones, entregas, informes de Calidad
// del mueble y sus componentes, revisión final); no hay tabla de eventos aparte. Sin
// base de datos, para poder probarlo (la lectura está en linea-tiempo-db.ts).

import { etiquetaProceso, revisionEntrega, type Proceso } from "@/lib/produccion/asignaciones";
import { AREA_PAGO_LABELS, type CobroMueble } from "./pago-maquilador";

export type TonoEvento = "neutro" | "bien" | "mal" | "aviso";

export interface EventoMueble {
  id: string;
  // Momento exacto (timestamp ISO), para ordenar y mostrar.
  fecha: string;
  titulo: string;
  detalle: string | null;
  quien: string | null;
  tono: TonoEvento;
  // Foto de la hoja de entrega (URL firmada), si la hay.
  fotoUrl?: string | null;
}

export interface AsignacionTiempo {
  id: string;
  equipo: string;
  proceso: Proceso;
  vez_paso: number | null;
  veces_proceso: number | null;
  cantidad: number;
  creado_en: string;
  creado_por: string | null;
  cancelada_en: string | null;
  cancelada_por: string | null;
  motivo_cancelacion: string | null;
  adelantada: boolean;
  // Retrabajo: folio del informe (CAL-) o de la revisión final (FIN-) que lo originó.
  folio_rechazo: string | null;
  folio_revision_final: string | null;
}

export interface EntregaTiempo {
  id: string;
  asignacion_id: string;
  cantidad: number;
  registrado_en: string;
  registrado_por: string | null;
  anulada_en: string | null;
  motivo_anulacion: string | null;
  verificada_en: string | null;
  rechazada_en: string | null;
  motivo_rechazo: string | null;
  fotoUrl?: string | null;
}

export interface InformeTiempo {
  id: string;
  folio: string;
  aprobado: boolean;
  cantidad: number | null;
  elaborado_en: string;
  elaborado_por: string | null;
  // "Producto No Conforme", "Incidencia"…; null en la evaluación normal.
  tipo_reporte: string | null;
  // "Componente 3 · CAJÓN" si el informe es de un componente; null si es del mueble.
  componente: string | null;
}

export interface RevisionFinalTiempo {
  id: string;
  folio: string;
  aprobado: boolean;
  cantidad: number;
  motivo: string | null;
  elaborado_en: string;
  elaborado_por: string | null;
  // Ya en palabras: "Armado 2", "Ingeniería"…
  origen: string | null;
  regresaA: string | null;
}

export interface DatosLineaTiempo {
  unidad: string | null;
  liberado: { en: string; por: string | null } | null;
  hoja: { folio: string; en: string } | null;
  asignaciones: AsignacionTiempo[];
  entregas: EntregaTiempo[];
  informes: InformeTiempo[];
  revisiones: RevisionFinalTiempo[];
  // Recibos que cobraron este mueble (ver pago-maquilador.ts).
  cobros: CobroMueble[];
  // id de usuario -> nombre (o correo). Quien no aparezca queda sin nombre.
  nombres: Map<string, string>;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

function piezas(n: number | null, unidad: string | null): string {
  return `${redondear(Number(n))} ${unidad ?? "pz"}`;
}

function unir(partes: (string | null | undefined | false)[]): string | null {
  const texto = partes.filter((p): p is string => !!p && p.trim() !== "").join(" · ");
  return texto || null;
}

export function lineaTiempoMueble(d: DatosLineaTiempo): EventoMueble[] {
  const nombre = (id: string | null) => (id ? d.nombres.get(id) ?? null : null);
  const eventos: EventoMueble[] = [];

  if (d.liberado) {
    eventos.push({
      id: "liberado",
      fecha: d.liberado.en,
      titulo: "Liberado a Producción",
      detalle: null,
      quien: nombre(d.liberado.por),
      tono: "neutro",
    });
  }
  if (d.hoja) {
    eventos.push({
      id: "hoja",
      fecha: d.hoja.en,
      titulo: "Se generó la hoja de viajero",
      detalle: d.hoja.folio,
      quien: null,
      tono: "neutro",
    });
  }

  const asignacionPorId = new Map(d.asignaciones.map((a) => [a.id, a]));
  for (const a of d.asignaciones) {
    const paso = etiquetaProceso(a);
    const retrabajo = a.folio_revision_final ?? a.folio_rechazo;
    eventos.push({
      id: `asignacion-${a.id}`,
      fecha: a.creado_en,
      titulo: `${retrabajo ? "Retrabajo asignado" : "Asignado"} a ${a.equipo}: ${piezas(a.cantidad, d.unidad)}`,
      detalle: unir([
        paso,
        retrabajo && `por el rechazo ${retrabajo}`,
        a.adelantada && "antes de que el paso anterior entregara",
      ]),
      quien: nombre(a.creado_por),
      tono: retrabajo ? "aviso" : "neutro",
    });
    if (a.cancelada_en) {
      eventos.push({
        id: `cancelada-${a.id}`,
        fecha: a.cancelada_en,
        titulo: `Se canceló la asignación a ${a.equipo}: ${piezas(a.cantidad, d.unidad)}`,
        detalle: unir([paso, a.motivo_cancelacion]),
        quien: nombre(a.cancelada_por),
        tono: "neutro",
      });
    }
  }

  for (const e of d.entregas) {
    const a = asignacionPorId.get(e.asignacion_id);
    const revision = revisionEntrega(e);
    const estado = {
      verificada: { texto: "Producción la preaprobó: pasa a Calidad", tono: "bien" as const },
      rechazada: { texto: `No cumplió${e.motivo_rechazo ? `: ${e.motivo_rechazo}` : ""}`, tono: "mal" as const },
      por_verificar: { texto: "Falta que Producción la revise", tono: "aviso" as const },
      anulada: {
        texto: `Anulada${e.motivo_anulacion ? `: ${e.motivo_anulacion}` : ""}`,
        tono: "neutro" as const,
      },
    }[revision];
    eventos.push({
      id: `entrega-${e.id}`,
      fecha: e.registrado_en,
      titulo: `${a?.equipo ?? "El equipo"} entregó ${piezas(e.cantidad, d.unidad)}`,
      detalle: unir([a && etiquetaProceso(a), estado.texto]),
      quien: nombre(e.registrado_por),
      tono: estado.tono,
      fotoUrl: e.fotoUrl ?? null,
    });
  }

  for (const i of d.informes) {
    const cuantas = i.cantidad != null ? ` ${piezas(i.cantidad, d.unidad)}` : "";
    const titulo = i.tipo_reporte
      ? `Calidad levantó ${i.tipo_reporte}`
      : i.aprobado
        ? `Calidad aprobó${cuantas}`
        : `Calidad rechazó${cuantas}`;
    eventos.push({
      id: `informe-${i.id}`,
      fecha: i.elaborado_en,
      titulo,
      detalle: unir([i.componente, i.folio]),
      quien: nombre(i.elaborado_por),
      tono: i.aprobado && !i.tipo_reporte ? "bien" : "mal",
    });
  }

  for (const r of d.revisiones) {
    eventos.push({
      id: `final-${r.id}`,
      fecha: r.elaborado_en,
      titulo: `Revisión final: ${r.aprobado ? "aprobó" : "rechazó"} ${piezas(r.cantidad, d.unidad)}`,
      detalle: r.aprobado
        ? r.folio
        : unir([r.motivo, r.origen && `nació en ${r.origen}`, r.regresaA && `regresa a ${r.regresaA}`, r.folio]),
      quien: nombre(r.elaborado_por),
      tono: r.aprobado ? "bien" : "mal",
    });
  }

  // El final del recorrido: el maquilador lo cobra en un recibo y Estimaciones lo paga.
  for (const c of d.cobros) {
    eventos.push({
      id: `cobro-${c.reciboId}`,
      fecha: c.creado_en,
      titulo: `${c.contratista ?? "El maquilador"} cobró ${piezas(c.cantidad, d.unidad)} en ${c.folio}`,
      detalle: unir([AREA_PAGO_LABELS[c.area], c.reproceso > 0 && `más ${piezas(c.reproceso, d.unidad)} de reproceso`]),
      quien: nombre(c.capturado_por),
      tono: "neutro",
    });
    if (c.estado === "pagado" && c.pagado_en) {
      eventos.push({
        id: `pago-${c.reciboId}`,
        fecha: c.pagado_en,
        titulo: `Se pagó el recibo ${c.folio}`,
        detalle: unir([AREA_PAGO_LABELS[c.area], c.contratista]),
        quien: nombre(c.pagado_por),
        tono: "bien",
      });
    }
  }

  // Lo más reciente arriba. A la misma hora se respeta el orden en que se armó la
  // lista (liberación, asignación, entrega, Calidad), que es el orden del trabajo.
  return eventos
    .map((e, orden) => ({ e, orden, t: Date.parse(e.fecha) }))
    .sort((x, y) => y.t - x.t || y.orden - x.orden)
    .map(({ e }) => e);
}

// "21/10/2026 14:05", en hora de México (la planta trabaja en ese horario, no en UTC).
export function formatoFechaHora(iso: string): string {
  const partes = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}`;
}
