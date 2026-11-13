// Manda al celular los avisos que acaba de provocar una persona. Solo para código de servidor.
//
// Los avisos los crean triggers de la base (migración avisos_por_area) en el momento del hecho; aquí se
// reparten a quien le toca. Se llama (1) desde las rutas de servidor que provocan un aviso (liberar, entregar)
// y (2) desde la campanita, que pregunta cada minuto: así también salen los que nacen de una función que la app
// llama directo (Calidad evalúa, recibos) sin una ruta propia. Nunca lanza: un aviso que no sale no debe tumbar
// la operación que lo provocó.

import { createAdminClient } from "@/lib/supabase/admin";
import { notificacionesConfiguradas, enviarAUsuarios } from "./enviar";
import { MINUTOS_PARA_ENVIAR, destinatariosDeAviso, notificacionDeAviso, type AvisoPendiente } from "./avisos";

// Los roles de un área a los que les llegan los avisos de esa área.
const ROLES_CON_AVISO = ["administrador", "trabajador"];

// Devuelve cuántos avisos repartió. Cada aviso se "reclama" con un solo UPDATE (solo uno gana si dos
// llamadas coinciden), así que nunca se manda dos veces.
export async function despacharAvisos(usuarioId: string): Promise<number> {
  try {
    if (!notificacionesConfiguradas()) return 0;
    const admin = createAdminClient();
    const desde = new Date(Date.now() - MINUTOS_PARA_ENVIAR * 60_000).toISOString();
    const { data, error } = await admin
      .from("avisos")
      .update({ push_enviado_en: new Date().toISOString() })
      .eq("creado_por", usuarioId)
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
  } catch (e) {
    console.error("avisos: no se pudieron repartir", (e as Error).message);
    return 0;
  }
}
