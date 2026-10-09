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
import { cargarDetenidos } from "../src/lib/produccion/detenidos-db";
import { cargarCalidadPorEquipo } from "../src/lib/produccion/calidad-equipos-db";
import { hoyMexico } from "../src/lib/produccion/asignaciones";

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
// Desde aquí cada informe guarda sus piezas verificadas
// (migración 20261008174652_informe_piezas_verificadas).
const INICIO_PIEZAS_GUARDADAS = "2026-10-08T17:46:52Z";
// Desde aquí los muebles se evalúan por lote
// (migración 20261008180122_calidad_por_lote_y_retrabajo).
const INICIO_POR_LOTE = "2026-10-08T18:01:22Z";
// Periodos con la verificación de Producción apagada (ajustes_flujo): Calidad
// evaluó sin lotes ni piezas preaprobadas, así que esos informes no cuentan
// para las reglas de abajo. Del 20261009151636_calidad_sin_verificacion_produccion
// al 20261009191602_entrega_con_preaprobacion. Si se vuelve a apagar, agregar
// aquí el periodo.
const PERIODOS_SIN_VERIFICACION: [string, string][] = [["2026-10-09T15:16:36Z", "2026-10-09T19:16:02Z"]];
const conVerificacion = (elaboradoEn: string) =>
  !PERIODOS_SIN_VERIFICACION.some(
    ([desde, hasta]) =>
      new Date(elaboradoEn).getTime() >= new Date(desde).getTime() &&
      new Date(elaboradoEn).getTime() < new Date(hasta).getTime()
  );

describe.skipIf(!hayVariables)("Producción y Calidad (solo lectura)", () => {
  describe("objetos que deben seguir en la base", () => {
    it("no falta ningún trigger ni RLS del flujo, ni hay políticas de escritura directa", async () => {
      const { data, error } = await servicio.rpc("faltantes_reglas_produccion_calidad");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe("permisos", () => {
    const entrega = {
      p_asignacion_id: UUID_NULO,
      p_fecha_entrega: "2026-10-08",
      p_cantidad: 1,
      p_folios_calidad: "prueba",
      p_foto_path: `${UUID_NULO}/prueba.webp`,
      p_resultado: "cumple",
    };
    const funciones: [string, Record<string, unknown>][] = [
      ["registrar_entrega_produccion", entrega],
      ["verificar_entrega_produccion", { p_entrega_id: UUID_NULO }],
      ["rechazar_entrega_produccion", { p_entrega_id: UUID_NULO, p_motivo: "prueba" }],
      ["anular_entrega_produccion", { p_entrega_id: UUID_NULO, p_motivo: "prueba" }],
      ["crear_informe_calidad", { p_item_id: UUID_NULO, p_aprobado: true, p_descripcion: "" }],
      ["item_verificado_por_produccion", { p_item_id: UUID_NULO }],
      ["evaluar_entrega_calidad", { p_entrega_id: UUID_NULO, p_aprobadas: 1, p_rechazadas: 0 }],
      [
        "crear_retrabajo_produccion",
        { p_informe_id: UUID_NULO, p_equipo_id: UUID_NULO, p_cantidad: 1, p_fecha_asignacion: "2026-10-08", p_notas: "" },
      ],
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
      ["registrar_entrega_produccion", entrega, "Solo Producción puede registrar"],
      ["verificar_entrega_produccion", { p_entrega_id: UUID_NULO }, "Solo Producción puede verificar"],
      ["rechazar_entrega_produccion", { p_entrega_id: UUID_NULO, p_motivo: "x" }, "Solo Producción puede rechazar"],
      ["anular_entrega_produccion", { p_entrega_id: UUID_NULO, p_motivo: "x" }, "Solo el administrador de Producción"],
      ["crear_informe_calidad", { p_item_id: UUID_NULO, p_aprobado: true, p_descripcion: "" }, "No tienes permiso"],
      ["evaluar_entrega_calidad", { p_entrega_id: UUID_NULO, p_aprobadas: 1, p_rechazadas: 0 }, "No tienes permiso"],
      [
        "crear_retrabajo_produccion",
        { p_informe_id: UUID_NULO, p_equipo_id: UUID_NULO, p_cantidad: 1, p_fecha_asignacion: "2026-10-08", p_notas: "" },
        "Solo Producción puede reasignar",
      ],
    ];
    for (const [funcion, args, mensaje] of porRol) {
      it(`${funcion} rechaza a quien no tiene el rol`, async () => {
        const { error } = await servicio.rpc(funcion, args);
        expect(error?.message).toContain(mensaje);
      });
    }
  });

  describe("datos", () => {
    it("calidad por equipo se calcula sin fallar y sus números cuadran", async () => {
      for (const m of await cargarCalidadPorEquipo(servicio, null)) {
        expect(m.verificadas + m.rechazadasProduccion).toBeLessThanOrEqual(m.entregadas);
        expect(m.aprobadas + m.rechazadasCalidad).toBe(m.evaluadas);
        expect(m.evaluadas).toBeLessThanOrEqual(m.verificadas);
      }
    });

    it("las alertas de cosas detenidas se calculan sin fallar", async () => {
      const d = await cargarDetenidos(servicio, hoyMexico());
      for (const p of [d.sinVerificar, d.sinEvaluar, d.sinReasignar]) {
        expect(p.detenidos).toBeLessThanOrEqual(p.total);
      }
    });

    it("ningún lote tiene más piezas evaluadas que las que se entregaron", async (ctx) => {
      const { data, error } = await servicio
        .from("lotes_calidad")
        .select("entrega_id, cantidad, aprobadas, rechazadas, pendiente")
        .limit(1000);
      expect(error).toBeNull();
      if (!data?.length) {
        console.warn("[test:db] Sin lotes verificados: se omite el invariante de lotes.");
        return ctx.skip();
      }
      const malos = data.filter(
        (l) =>
          Number(l.pendiente) < 0 ||
          Number(l.aprobadas) + Number(l.rechazadas) + Number(l.pendiente) !== Number(l.cantidad)
      );
      expect(malos.map((l) => l.entrega_id)).toEqual([]);
    });

    it("ningún rechazo se reasignó por más piezas de las rechazadas", async (ctx) => {
      const { data, error } = await servicio
        .from("rechazos_calidad")
        .select("folio, por_reasignar")
        .limit(1000);
      expect(error).toBeNull();
      if (!data?.length) {
        console.warn("[test:db] Sin rechazos de lotes: se omite el invariante de retrabajos.");
        return ctx.skip();
      }
      expect(data.filter((r) => Number(r.por_reasignar) < 0).map((r) => r.folio)).toEqual([]);
    });

    it("desde la evaluación por lote, todo informe de un mueble está ligado a su entrega", async (ctx) => {
      const { data: todos } = await servicio
        .from("informes_calidad")
        .select("folio, entrega_id, planeacion_item_id, elaborado_en")
        .gte("elaborado_en", INICIO_POR_LOTE)
        .is("entrega_id", null)
        .limit(500);
      const informes = (todos ?? []).filter((i) => conVerificacion(i.elaborado_en));
      if (!informes.length) {
        console.warn("[test:db] Sin informes sin lote desde la evaluación por lote: se omite.");
        return ctx.skip();
      }
      const { data: muebles } = await servicio
        .from("planeacion_items")
        .select("id")
        .in("id", [...new Set(informes.map((i) => i.planeacion_item_id as string))])
        .eq("tipo_registro", "MO");
      const ids = new Set((muebles ?? []).map((m) => m.id));
      expect(informes.filter((i) => ids.has(i.planeacion_item_id)).map((i) => i.folio)).toEqual([]);
    });

    it("todo informe nuevo guarda cuántas piezas verificadas tenía el mueble", async (ctx) => {
      const { data: todos } = await servicio
        .from("informes_calidad")
        .select("folio, piezas_verificadas, elaborado_en")
        .gte("elaborado_en", INICIO_PIEZAS_GUARDADAS)
        .limit(500);
      const informes = (todos ?? []).filter((i) => conVerificacion(i.elaborado_en));
      if (!informes.length) {
        console.warn("[test:db] Sin informes desde que se guardan las piezas: se omite.");
        return ctx.skip();
      }
      const sinPiezas = informes.filter((i) => !(Number(i.piezas_verificadas) > 0));
      expect(sinPiezas.map((i) => i.folio)).toEqual([]);
    });

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
      const { data: todos } = await servicio
        .from("informes_calidad")
        .select("folio, planeacion_item_id, elaborado_en")
        .gte("elaborado_en", INICIO_REGLA_VERIFICADO)
        .limit(300);
      const informes = (todos ?? []).filter((i) => conVerificacion(i.elaborado_en));
      if (!informes.length) {
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
