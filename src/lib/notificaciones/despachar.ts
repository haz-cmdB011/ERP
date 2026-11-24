// Manda al celular los avisos nuevos y genera los recordatorios por tiempo. Solo para código de servidor.
//
// Hay dos tipos de aviso (migraciones avisos_por_area y avisos_recordatorios):
//  - Los que nacen de un hecho (Producción entregó, Calidad rechazó, recibo nuevo…): los crea un trigger de la
//    base en el momento y llevan a quien lo provocó en `creado_por`. `despacharAvisos` los reparte.
//  - Los recordatorios (asignado y sin entregar, recibos sin revisar…): nacen del paso del tiempo, no de un hecho,
//    así que no hay quien los provoque. `despacharRecordatorios` pide a la base que los genere (una vez al día
//    por tipo; la base impide duplicarlos) y los reparte.
//
// Se llama (1) desde las rutas de servidor que provocan un aviso (entregar) y (2) desde la campanita, que
// pregunta cada minuto: así también salen los que nacen de una función que la app llama directo (Calidad
// evalúa, recibos) y los recordatorios. Nunca lanza: un aviso que no sale no debe tumbar la operación.

import { createAdminClient } from "@/lib/supabase/admin";
import { notificacionesConfiguradas, enviarAUsuarios } from "./enviar";
import {
  MINUTOS_ENTRE_RECORDATORIOS,
  MINUTOS_PARA_ENVIAR,
  destinatariosDeAviso,
  notificacionDeAviso,
  type AvisoPendiente,
} from "./avisos";

// Los roles de un área a los que les llegan los avisos de esa área.
const ROLES_CON_AVISO = ["administrador", "trabajador"];

type Admin = ReturnType<typeof createAdminClient>;

// Reclama con un solo UPDATE (solo uno gana si dos llamadas coinciden, así que nunca se manda dos veces) los
// avisos recientes de `creadoPor` (null = los que nadie provocó: recordatorios) y los manda a quien le toca.
// Devuelve cuántos repartió.
async function repartirAvisos(admin: Admin, creadoPor: string | null): Promise<number> {
  const desde = new Date(Date.now() - MINUTOS_PARA_ENVIAR * 60_000).toISOString();
  const reclamo = admin.from("avisos").update({ push_enviado_en: new Date().toISOString() });
  const { data, error } = await (creadoPor === null ? reclamo.is("creado_por", null) : reclamo.eq("creado_por", creadoPor))
    .is("push_enviado_en", null)
    .gte("creado_en", desde)
    .select("id, area, destinatario_id, tipo, titulo, cuerpo, url, creado_por")
    .returns<AvisoPendiente[]>();
  if (error || !data || data.length === 0) {
    if (error) console.error("avisos: no se pudieron reclamar", error.message);
    return 0;
  }

  // El personal de las áreas que lo necesitan (los avisos de una persona no lo requieren).
  const areas = [...new Set(data.filter((a) => !a.destinatario_id).map((a) => a.area))];
  const personalPorArea: Record<string, string[]> = {};
  if (areas.length > 0) {
    const { data: personal, error: errorPersonal } = await admin
      .from("perfiles")
      .select("id, area")
      .in("area", areas)
      .in("rol", ROLES_CON_AVISO)
      .returns<{ id: string; area: string }[]>();
    if (errorPersonal) console.error("avisos: no se pudo leer el personal", errorPersonal.message);
    for (const p of personal ?? []) (personalPorArea[p.area] ??= []).push(p.id);
  }

  await Promise.all(
    data.map((aviso) => {
      const ids = destinatariosDeAviso(aviso, personalPorArea);
      return ids.length > 0 ? enviarAUsuarios(ids, notificacionDeAviso(aviso)) : null;
    })
  );
  return data.length;
}

// Reparte al celular los avisos que acaba de provocar esta persona.
export async function despacharAvisos(usuarioId: string): Promise<number> {
  try {
    if (!notificacionesConfiguradas()) return 0;
    return await repartirAvisos(createAdminClient(), usuarioId);
  } catch (e) {
    console.error("avisos: no se pudieron repartir", (e as Error).message);
    return 0;
  }
}

// Última vez que ESTA instancia del servidor generó recordatorios. No hace falta que sea exacto: la base
// impide duplicarlos, esto solo evita pedirlos en cada minuto de cada pestaña abierta.
let ultimaGeneracion = 0;

// Pide a la base que genere los recordatorios que toquen y los reparte al celular. Devuelve cuántos repartió.
// `ahora` y `forzar` existen para las pruebas.
export async function despacharRecordatorios(ahora: number = Date.now(), forzar = false): Promise<number> {
  try {
    if (!forzar && ahora - ultimaGeneracion < MINUTOS_ENTRE_RECORDATORIOS * 60_000) return 0;
    ultimaGeneracion = ahora;
    const admin = createAdminClient();
    const { error } = await admin.rpc("generar_recordatorios");
    // Sin la migración (o con un fallo) no hay recordatorios, pero la campanita sigue como siempre.
    if (error) {
      console.error("avisos: no se pudieron generar los recordatorios", error.message);
      return 0;
    }
    // De paso se borran los avisos de más de 60 días (ya no los muestra la campanita). Si falla, no estorba.
    const limpieza = await admin.rpc("limpiar_avisos");
    if (limpieza.error) console.error("avisos: no se pudo limpiar los avisos viejos", limpieza.error.message);
    if (!notificacionesConfiguradas()) return 0;
    return await repartirAvisos(admin, null);
  } catch (e) {
    console.error("avisos: no se pudieron generar los recordatorios", (e as Error).message);
    return 0;
  }
}

// Para las pruebas: vuelve a permitir generar de inmediato.
export function reiniciarRecordatoriosParaPruebas() {
  ultimaGeneracion = 0;
}
