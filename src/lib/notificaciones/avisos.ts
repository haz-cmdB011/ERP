// Avisos por área (campanita dentro de la app y notificaciones al celular). Lógica sin base de datos ni
// navegador: la tabla `avisos` y sus triggers viven en la migración avisos_por_area; el envío, en despachar.ts.

import type { Notificacion } from "./carga";

// Las áreas que reciben avisos (Finanzas todavía no tiene).
export const AREAS_AVISO = ["planeacion", "produccion", "calidad", "estimaciones"] as const;
export type AreaAviso = (typeof AREAS_AVISO)[number];

export function esAreaAviso(valor: unknown): valor is AreaAviso {
  return typeof valor === "string" && (AREAS_AVISO as readonly string[]).includes(valor);
}

// Cuánto tiempo atrás se muestran en la campanita y cuántos caben en la lista.
export const DIAS_DE_AVISOS = 30;
export const MAX_AVISOS = 30;
// Un aviso solo se manda al celular si es reciente: uno viejo que nunca salió ya no es noticia.
export const MINUTOS_PARA_ENVIAR = 15;
// Tope de ids por petición de "marcar como leído".
export const MAX_IDS_LEER = 50;

// Un aviso como lo ve la campanita.
export interface Aviso {
  id: string;
  area: AreaAviso;
  tipo: string;
  titulo: string;
  cuerpo: string;
  url: string | null;
  creadoEn: string;
  leido: boolean;
}

// Un aviso recién creado que falta mandar al celular (fila de la tabla `avisos`).
export interface AvisoPendiente {
  id: string;
  area: string;
  destinatario_id: string | null;
  tipo: string;
  titulo: string;
  cuerpo: string;
  url: string | null;
  creado_por: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Los ids que pide marcar como leídos: solo uuids, sin repetir y con tope. null si el cuerpo no es válido.
export function leerIdsAviso(valor: unknown): string[] | null {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > MAX_IDS_LEER) return null;
  if (!valor.every((id) => typeof id === "string" && UUID.test(id))) return null;
  return [...new Set(valor as string[])];
}

// A quién le llega al celular: la persona del aviso o el personal de su área (administrador y trabajador),
// sin quien lo provocó (no necesita que le avisen lo que acaba de hacer). `personalPorArea` trae los ids de
// cada área; el desarrollador no está ahí a propósito: ve los avisos al entrar al área, no le llegan todos.
export function destinatariosDeAviso(aviso: AvisoPendiente, personalPorArea: Record<string, string[]>): string[] {
  const candidatos = aviso.destinatario_id ? [aviso.destinatario_id] : (personalPorArea[aviso.area] ?? []);
  return [...new Set(candidatos)].filter((id) => id !== aviso.creado_por);
}

// El texto que sale en el celular. La etiqueta es única por aviso para que uno nuevo no tape al anterior.
export function notificacionDeAviso(aviso: AvisoPendiente): Notificacion {
  return {
    titulo: aviso.titulo,
    cuerpo: aviso.cuerpo,
    url: aviso.url ?? undefined,
    etiqueta: aviso.id,
  };
}

// "hace un momento", "hace 5 min", "hace 3 h", "ayer", "hace 4 d" y, pasada una semana, la fecha.
export function tiempoRelativo(creadoEn: string, ahora: number = Date.now()): string {
  const fecha = new Date(creadoEn);
  const ms = ahora - fecha.getTime();
  if (Number.isNaN(ms)) return "";
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} d`;
  return fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
}
