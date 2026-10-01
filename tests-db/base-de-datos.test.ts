// Pruebas de la base de datos de Supabase (SOLO LECTURA): detectan regresiones en
// las funciones y permisos del generador de recibos sin revisar a mano.
//
//   npm run test:db        (usa las variables de .env.local)
//
// Tres grupos:
//   1. Funciones puras (norm_modelo, descripcion_incluye_iluminacion): casos fijos.
//   2. Permisos: lo que un usuario sin sesión o sin rol NO debe poder ejecutar.
//   3. Datos del PM: (a) invariante "solo cuentan los padres, de todos los PM de
//      la OT", que se comprueba contra las propias tablas y por eso aguanta que
//      cambien los datos; (b) casos conocidos (TIRAS DE ROSA MORADO en la OT
//      102-24 = 119), que se OMITEN con aviso si la OT no está cargada.
//
// No escribe nada: usa la clave de servicio solo para leer y para llamar
// funciones que rechazan sin rol.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { claveModelo, claveOt } from "../src/lib/estimaciones/conciliacion-pm";
import { describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hayVariables = Boolean(url && anonKey && serviceKey);

const opciones = { auth: { autoRefreshToken: false, persistSession: false } };
const servicio = hayVariables ? createClient(url!, serviceKey!, opciones) : (null as never as SupabaseClient);
const anonimo = hayVariables ? createClient(url!, anonKey!, opciones) : (null as never as SupabaseClient);

const UUID_NULO = "00000000-0000-0000-0000-000000000000";

describe.skipIf(!hayVariables)("base de datos de Supabase (solo lectura)", () => {
  describe("funciones puras", () => {
    // Regla de 20260930194232_reglas_modelo_iluminacion.sql: sin mayúsculas,
    // acentos, espacios ni signos ("DEC-313" y "dec 313" son el mismo modelo).
    it("norm_modelo ignora mayúsculas, acentos, espacios y signos", async () => {
      const casos: [string, string][] = [
        [" dec-313 ", "DEC313"],
        ["fx   306", "FX306"],
        ["PIJ-2 (3.0)", "PIJ230"],
        ["Lámpara.1", "LAMPARA1"],
      ];
      for (const [entrada, esperado] of casos) {
        const { data, error } = await servicio.rpc("norm_modelo", { p_modelo: entrada });
        expect(error).toBeNull();
        expect(data).toBe(esperado);
      }
    });

    it("descripcion_incluye_iluminacion: menciona sí, niega o no menciona no", async () => {
      const casos: [string, boolean][] = [
        ["PERIMETRO\nINCLUYE ILUMINACIÓN Y REGISTRO", true],
        ["ESPEJO CON ILUMINACION PERIMETRAL A BASE DE LEDS", true],
        ["mochetas con iluminacion led 3000k", true],
        ["cuerpo iluminado", true],
        ["FOCAL INTERIOR. NO INCLUYE ILUMINACION.", false],
        ["MESA SIN ILUMINACION", false],
        ["NO LLEVA  ILUMINACIÓN", false],
        ["MESA SIN LUCES", false],
      ];
      for (const [descripcion, esperado] of casos) {
        const { data, error } = await servicio.rpc("descripcion_incluye_iluminacion", {
          p_descripcion: descripcion,
        });
        expect(error, descripcion).toBeNull();
        expect(data, descripcion).toBe(esperado);
      }
    });
  });

  describe("permisos", () => {
    // Un usuario sin sesión (anon) no debe poder ejecutar ninguna de estas.
    const privilegiadas: [string, Record<string, unknown>][] = [
      ["eliminar_recibo_definitivo", { p_tipo: "electrificacion", p_recibo_id: UUID_NULO }],
      ["decidir_discrepancia_pm", { p_id: UUID_NULO, p_decision: "aceptada", p_nota: "" }],
      ["listar_ots_recibos", {}],
      ["listar_modelos_ot_recibos", { p_ot: "X" }],
      ["listar_ots_electrificacion", {}],
      ["listar_modelos_ot_electrificacion", { p_ot: "X" }],
      ["cantidad_pm_ot", { p_ot: "X", p_modelo: "X", p_solo_iluminacion: false }],
      ["cantidad_registrada_ot", { p_ot: "X", p_modelo: "X", p_area: "acabados" }],
      ["ot_contra_cobrado", {}],
      ["pedido_id_por_ot", { p_ot: "X" }],
      ["auditar_recibos", {}],
    ];

    for (const [funcion, args] of privilegiadas) {
      it(`${funcion}: no la puede ejecutar un usuario sin sesión`, async () => {
        const { data, error } = await anonimo.rpc(funcion, args);
        expect(error, "debe rechazarla").not.toBeNull();
        expect(data).toBeNull();
      });
    }

    it("eliminar_recibo_definitivo rechaza a quien no es desarrollador", async () => {
      // La clave de servicio no trae usuario (auth.uid() nulo): is_admin() es falso.
      const { error } = await servicio.rpc("eliminar_recibo_definitivo", {
        p_tipo: "electrificacion",
        p_recibo_id: UUID_NULO,
      });
      expect(error?.message).toContain("Solo el desarrollador");
    });

    it("decidir_discrepancia_pm rechaza a quien no es admin de Estimaciones", async () => {
      const { error } = await servicio.rpc("decidir_discrepancia_pm", {
        p_id: UUID_NULO,
        p_decision: "aceptada",
        p_nota: "",
      });
      expect(error?.message).toContain("Solo el administrador de Estimaciones");
    });

    it("el catálogo de OT y modelos exige rol de Estimaciones o maquilador", async () => {
      for (const [funcion, args] of [
        ["listar_ots_recibos", {}],
        ["listar_modelos_ot_recibos", { p_ot: "X" }],
        ["listar_ots_electrificacion", {}],
        ["listar_modelos_ot_electrificacion", { p_ot: "X" }],
      ] as const) {
        const { error } = await servicio.rpc(funcion, args);
        expect(error?.message, funcion).toContain("No tienes permiso");
      }
    });

    it("la bitácora de auditoría no se puede leer sin sesión", async () => {
      const { data } = await anonimo.from("auditoria").select("id").limit(1);
      expect(data ?? []).toEqual([]);
    });
  });

  describe("datos del PM", () => {
    // Lo que declaran todos los PM vigentes de la OT para un modelo, contando
    // todos sus muebles (base de Acabados y Armado) o solo los que tienen
    // iluminación (base de Electrificación).
    async function cantidadOt(ot: string, modelo: string, soloIluminacion = false): Promise<number | null> {
      const { data, error } = await servicio.rpc("cantidad_pm_ot", {
        p_ot: ot,
        p_modelo: modelo,
        p_solo_iluminacion: soloIluminacion,
      });
      expect(error).toBeNull();
      return data == null ? null : Number(data);
    }

    // PM vigentes con su OT (la clave que calcula la base para cada PM).
    async function pmsVigentes(): Promise<{ id: string; ot: string | null }[]> {
      const { data } = await servicio
        .from("pedidos")
        .select("id, orden_trabajo, numero_pedido")
        .is("eliminado_en", null)
        .is("eliminado_definitivo_en", null)
        .limit(500);
      return ((data ?? []) as { id: string; orden_trabajo: string | null; numero_pedido: string }[]).map(
        (p) => ({ id: p.id, ot: claveOt(p.orden_trabajo ?? p.numero_pedido) })
      );
    }

    it("invariante: la cantidad de la OT por modelo es la suma de los padres de todos sus PM", async (ctx) => {
      const pms = await pmsVigentes();
      if (!pms.length) {
        console.warn("[test:db] Sin pedidos cargados: se omite el invariante de padres.");
        return ctx.skip();
      }

      // Suma, por OT y modelo, los padres vigentes de la versión activa de cada PM.
      const pmsPorOt = new Map<string, string[]>();
      for (const p of pms) {
        if (p.ot) pmsPorOt.set(p.ot, [...(pmsPorOt.get(p.ot) ?? []), p.id]);
      }
      let comprobados = 0;
      for (const [ot, ids] of [...pmsPorOt].slice(0, 6)) {
        const { data: versiones } = await servicio
          .from("pedido_versiones")
          .select("id")
          .eq("es_version_activa", true)
          .in("pedido_id", ids);
        const sumaPadres = new Map<string, number>();
        for (const v of (versiones ?? []) as { id: string }[]) {
          const { data: items } = await servicio
            .from("planeacion_items")
            .select("modelo, cantidad_total, tipo_registro, parent_item_id, estado_revision, eliminacion_solicitada_en")
            .eq("pedido_version_id", v.id)
            .limit(2000);
          for (const i of items ?? []) {
            if (!i.modelo?.trim() || i.estado_revision === "cancelado" || i.eliminacion_solicitada_en != null) continue;
            if (i.tipo_registro !== "MO" || i.parent_item_id != null) continue;
            const clave = claveModelo(i.modelo);
            sumaPadres.set(clave, (sumaPadres.get(clave) ?? 0) + Number(i.cantidad_total));
          }
        }
        for (const [modelo, esperado] of [...sumaPadres].slice(0, 4)) {
          const real = await cantidadOt(ot, modelo);
          expect(real, `${modelo} en la OT ${ot}`).toBeCloseTo(esperado, 2);
          // Electrificación: solo la parte con iluminación, nunca más que el total.
          const iluminacion = (await cantidadOt(ot, modelo, true)) ?? 0;
          expect(iluminacion, `${modelo} con iluminación`).toBeLessThanOrEqual(esperado + 1e-9);
          comprobados++;
        }
      }
      expect(comprobados).toBeGreaterThan(0);
    });

    it("un modelo que no existe en la OT no tiene cantidad (es descuadre)", async (ctx) => {
      const [p] = (await pmsVigentes()).filter((x) => x.ot);
      if (!p) return ctx.skip();
      expect(await cantidadOt(p.ot!, "MODELO-QUE-NO-EXISTE-XYZ")).toBeNull();
    });

    it("ot_clave agrupa el número de PM, la OT y sus variantes", async () => {
      for (const [entrada, esperado] of [
        ["2PM193-24", "193-24"],
        ["PM193-24 SOTANO 1", "193-24"],
        ["193-24", "193-24"],
        ["193-24-2 SDC17", "193-24"],
      ]) {
        const { data, error } = await servicio.rpc("ot_clave", { p_texto: entrada });
        expect(error).toBeNull();
        expect(data, entrada).toBe(esperado);
        expect(claveOt(entrada), `espejo de ${entrada}`).toBe(esperado);
      }
    });

    it("pedido_id_por_ot rechaza una OT que no está en el PM", async () => {
      const { error } = await servicio.rpc("pedido_id_por_ot", { p_ot: "OT-QUE-NO-EXISTE" });
      expect(error?.message).toContain("no está en el PM");
    });

    // Casos conocidos de los datos de producción (si se cargan otra vez los mismos
    // PM). Se omiten con aviso si la OT no está. Actualizar si Planeación corrige
    // las cantidades de esos pedidos.
    const conocidos: [string, string, number][] = [
      ["102-24", "TIRAS DE ROSA MORADO", 119], // 94 en 2PM102-24 + 25 en su hoja "PEDIDO (2)"
    ];
    for (const [ot, modelo, esperado] of conocidos) {
      it(`caso conocido: ${modelo} en la OT ${ot} = ${esperado}`, async (ctx) => {
        const cantidad = await cantidadOt(ot, modelo);
        if (cantidad == null) {
          console.warn(`[test:db] La OT ${ot} no está cargada: se omite ${modelo}.`);
          return ctx.skip();
        }
        expect(cantidad).toBe(esperado);
      });
    }
  });
});
