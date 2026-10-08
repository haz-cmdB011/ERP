// Pruebas (SOLO LECTURA) de las reglas entre Producción y Calidad:
//
//   npm run test:db        (usa las variables de .env.local)
//
//   1. Lo que debe seguir en la base: triggers de planeacion_items y RLS de las
//      tablas del flujo (faltantes_reglas_produccion_calidad).
//   2. Permisos: sin sesión o sin rol nadie verifica, rechaza, anula ni evalúa.
//   3. Datos: invariantes que deben cumplirse con lo que haya cargado; si no hay
//      datos se omiten con aviso.
//
// No escribe nada: las llamadas que modificarían algo se hacen sin rol y la base
// las rechaza antes de tocar una fila.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hayVariables = Boolean(url && anonKey && serviceKey);

const opciones = { auth: { autoRefreshToken: false, persistSession: false } };
const servicio = hayVariables ? createClient(url!, serviceKey!, opciones) : (null as never as SupabaseClient);
const anonimo = hayVariables ? createClient(url!, anonKey!, opciones) : (null as never as SupabaseClient);

const UUID_NULO = "00000000-0000-0000-0000-000000000000";
// Desde aquí crear_informe_calidad exige piezas verificadas por Producción
// (migración 20261008172430_produccion_calidad_reglas).
const INICIO_REGLA_VERIFICADO = "2026-10-08T17:24:30Z";

describe.skipIf(!hayVariables)("Producción y Calidad (solo lectura)", () => {
  describe("objetos que deben seguir en la base", () => {
    it("no falta ningún trigger ni RLS del flujo", async () => {
      const { data, error } = await servicio.rpc("faltantes_reglas_produccion_calidad");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe("permisos", () => {
    const funciones: [string, Record<string, unknown>][] = [
      ["verificar_entrega_produccion", { p_entrega_id: UUID_NULO }],
      ["rechazar_entrega_produccion", { p_entrega_id: UUID_NULO, p_motivo: "prueba" }],
      ["anular_entrega_produccion", { p_entrega_id: UUID_NULO, p_motivo: "prueba" }],
      ["crear_informe_calidad", { p_item_id: UUID_NULO, p_aprobado: true, p_descripcion: "" }],
      ["item_verificado_por_produccion", { p_item_id: UUID_NULO }],
      ["faltantes_reglas_produccion_calidad", {}],
    ];
    for (const [funcion, args] of funciones) {
      it(`${funcion}: no la puede ejecutar un usuario sin sesión`, async () => {
        const { data, error } = await anonimo.rpc(funcion, args);
        expect(error, "debe rechazarla").not.toBeNull();
        expect(data).toBeNull();
      });
    }

    // La clave de servicio no trae usuario (auth.uid() nulo): no es de
    // Producción ni de Calidad, así que cada función debe rechazarla por rol.
    const porRol: [string, Record<string, unknown>, string][] = [
      ["verificar_entrega_produccion", { p_entrega_id: UUID_NULO }, "Solo Producción puede verificar"],
      ["rechazar_entrega_produccion", { p_entrega_id: UUID_NULO, p_motivo: "x" }, "Solo Producción puede rechazar"],
      ["anular_entrega_produccion", { p_entrega_id: UUID_NULO, p_motivo: "x" }, "Solo el administrador de Producción"],
      ["crear_informe_calidad", { p_item_id: UUID_NULO, p_aprobado: true, p_descripcion: "" }, "No tienes permiso"],
    ];
    for (const [funcion, args, mensaje] of porRol) {
      it(`${funcion} rechaza a quien no tiene el rol`, async () => {
        const { error } = await servicio.rpc(funcion, args);
        expect(error?.message).toContain(mensaje);
      });
    }
  });

  describe("datos", () => {
    it("toda asignación vigente es de un ítem liberado a producción", async (ctx) => {
      const { data: asignaciones } = await servicio
        .from("asignaciones_produccion")
        .select("planeacion_item_id")
        .is("cancelada_en", null)
        .not("planeacion_item_id", "is", null)
        .limit(1000);
      const ids = [...new Set((asignaciones ?? []).map((a) => a.planeacion_item_id as string))];
      if (!ids.length) {
        console.warn("[test:db] Sin asignaciones vigentes: se omite el invariante de liberación.");
        return ctx.skip();
      }
      const { data: items } = await servicio
        .from("planeacion_items")
        .select("id, item_code, estado_liberacion")
        .in("id", ids.slice(0, 300));
      const sinLiberar = (items ?? []).filter((i) => i.estado_liberacion !== "enviado_a_produccion");
      expect(sinLiberar.map((i) => i.item_code)).toEqual([]);
    });

    it("todo informe de Calidad nuevo es de un mueble con piezas verificadas por Producción", async (ctx) => {
      const { data: informes } = await servicio
        .from("informes_calidad")
        .select("folio, planeacion_item_id, elaborado_en")
        .gte("elaborado_en", INICIO_REGLA_VERIFICADO)
        .limit(300);
      if (!informes?.length) {
        console.warn("[test:db] Sin informes de Calidad desde la regla de verificación: se omite.");
        return ctx.skip();
      }

      const { data: items } = await servicio
        .from("planeacion_items")
        .select("id, tipo_registro, parent_item_id")
        .in("id", [...new Set(informes.map((i) => i.planeacion_item_id as string))]);
      const raizDe = new Map(
        (items ?? []).map((i) => [i.id, i.tipo_registro === "FU" && i.parent_item_id ? i.parent_item_id : i.id])
      );

      // Primera verificación vigente de cada mueble.
      const raices = [...new Set(raizDe.values())];
      const { data: asignaciones } = await servicio
        .from("asignaciones_produccion")
        .select("id, planeacion_item_id")
        .in("planeacion_item_id", raices)
        .is("cancelada_en", null);
      const muebleDe = new Map((asignaciones ?? []).map((a) => [a.id, a.planeacion_item_id as string]));
      const { data: entregas } = muebleDe.size
        ? await servicio
            .from("entregas_produccion")
            .select("asignacion_id, verificada_en")
            .in("asignacion_id", [...muebleDe.keys()])
            .is("anulada_en", null)
            .is("rechazada_en", null)
            .not("verificada_en", "is", null)
        : { data: [] };
      const primeraVerificacion = new Map<string, string>();
      for (const e of entregas ?? []) {
        const mueble = muebleDe.get(e.asignacion_id)!;
        const previa = primeraVerificacion.get(mueble);
        if (!previa || e.verificada_en < previa) primeraVerificacion.set(mueble, e.verificada_en);
      }

      const sinVerificar = informes.filter((inf) => {
        const desde = primeraVerificacion.get(raizDe.get(inf.planeacion_item_id) ?? "");
        return !desde || new Date(desde) > new Date(inf.elaborado_en);
      });
      expect(sinVerificar.map((i) => i.folio)).toEqual([]);
    });
  });
});
