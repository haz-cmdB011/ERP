// Pruebas de la base de datos de Supabase (SOLO LECTURA): detectan regresiones en
// las funciones y permisos del generador de recibos sin revisar a mano.
//
//   npm run test:db        (usa las variables de .env.local)
//
// Tres grupos:
//   1. Funciones puras (norm_modelo, descripcion_incluye_iluminacion): casos fijos.
//   2. Permisos: lo que un usuario sin sesión o sin rol NO debe poder ejecutar.
//   3. Datos del PM: (a) invariante "solo cuentan los padres", que se comprueba
//      contra las propias tablas y por eso aguanta que cambien los datos; (b)
//      casos conocidos (FXIJ-12 = 1, DEC-313 = 139...), que se OMITEN con aviso
//      si la OT no está cargada (por ejemplo tras limpiar la base).
//
// No escribe nada: usa la clave de servicio solo para leer y para llamar
// funciones que rechazan sin rol.

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

describe.skipIf(!hayVariables)("base de datos de Supabase (solo lectura)", () => {
  describe("funciones puras", () => {
    it("norm_modelo ignora mayúsculas y espacios de más", async () => {
      const casos: [string, string][] = [
        [" dec-313 ", "DEC-313"],
        ["fx   306", "FX 306"],
        ["PIJ-2 (3.0)", "PIJ-2 (3.0)"],
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
      ["listar_ots_pm_electrificacion", {}],
      ["listar_modelos_pm_electrificacion", { p_pedido: UUID_NULO }],
      ["cantidad_pm_modelo", { p_pedido: UUID_NULO, p_modelo: "X" }],
      ["cantidad_registrada_modelo", { p_pedido: UUID_NULO, p_modelo: "X" }],
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
      const ots = await servicio.rpc("listar_ots_pm_electrificacion");
      expect(ots.error?.message).toContain("No tienes permiso");
      const modelos = await servicio.rpc("listar_modelos_pm_electrificacion", { p_pedido: UUID_NULO });
      expect(modelos.error?.message).toContain("No tienes permiso");
    });

    it("la bitácora de auditoría no se puede leer sin sesión", async () => {
      const { data } = await anonimo.from("auditoria").select("id").limit(1);
      expect(data ?? []).toEqual([]);
    });
  });

  describe("datos del PM", () => {
    async function pedidoIdPorOt(ot: string): Promise<string | null> {
      const { data } = await servicio
        .from("pedidos")
        .select("id")
        .eq("numero_pedido", ot)
        .is("eliminado_en", null)
        .maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    }

    async function cantidadPm(pedidoId: string, modelo: string): Promise<number | null> {
      const { data, error } = await servicio.rpc("cantidad_pm_modelo", {
        p_pedido: pedidoId,
        p_modelo: modelo,
      });
      expect(error).toBeNull();
      return data == null ? null : Number(data);
    }

    it("invariante: la cantidad del PM por modelo es la suma de los padres, no de los hijos", async (ctx) => {
      const { data: versiones } = await servicio
        .from("pedido_versiones")
        .select("id, pedido_id")
        .eq("es_version_activa", true)
        .limit(40);
      if (!versiones?.length) {
        console.warn("[test:db] Sin pedidos cargados: se omite el invariante de padres.");
        return ctx.skip();
      }

      // Busca una versión con componentes (hijos) que comparten modelo con su padre.
      let comprobados = 0;
      for (const v of versiones as { id: string; pedido_id: string }[]) {
        const { data: items } = await servicio
          .from("planeacion_items")
          .select("modelo, cantidad_total, tipo_registro, parent_item_id, estado_revision, eliminacion_solicitada_en")
          .eq("pedido_version_id", v.id)
          .limit(2000);
        const vigentes = (items ?? []).filter(
          (i) =>
            i.modelo?.trim() &&
            i.estado_revision !== "cancelado" &&
            i.eliminacion_solicitada_en == null
        );
        const sumaPadres = new Map<string, number>();
        for (const i of vigentes) {
          if (i.tipo_registro !== "MO" || i.parent_item_id != null) continue;
          const clave = i.modelo!.trim().replace(/\s+/g, " ").toUpperCase();
          sumaPadres.set(clave, (sumaPadres.get(clave) ?? 0) + Number(i.cantidad_total));
        }
        for (const [modelo, esperado] of [...sumaPadres].slice(0, 5)) {
          const real = await cantidadPm(v.pedido_id, modelo);
          expect(real, `${modelo} en la versión ${v.id}`).toBeCloseTo(esperado, 2);
          comprobados++;
        }
        if (comprobados >= 15) break;
      }
      expect(comprobados).toBeGreaterThan(0);
    });

    it("un modelo que no existe en la OT no tiene cantidad (es descuadre)", async (ctx) => {
      const { data } = await servicio.from("pedidos").select("id").is("eliminado_en", null).limit(1).maybeSingle();
      const id = (data as { id: string } | null)?.id;
      if (!id) return ctx.skip();
      expect(await cantidadPm(id, "MODELO-QUE-NO-EXISTE-XYZ")).toBeNull();
    });

    it("pedido_id_por_ot rechaza una OT que no está en el PM", async () => {
      const { error } = await servicio.rpc("pedido_id_por_ot", { p_ot: "OT-QUE-NO-EXISTE" });
      expect(error?.message).toContain("no está en el PM");
    });

    // Casos conocidos de los datos de producción (si se cargan otra vez los mismos
    // PM). Se omiten con aviso si la OT no está. Actualizar si Planeación corrige
    // las cantidades de esos pedidos.
    const conocidos: [string, string, number][] = [
      ["1PM168-25", "FXIJ-12", 1], // el padre declara 1; sus hijos sumaban 13 más
      ["6PM168-25", "DEC-313", 139], // 417 contando hijos
      ["5PM168-25", "FX-306", 23], // seis filas padre
    ];
    for (const [ot, modelo, esperado] of conocidos) {
      it(`caso conocido: ${modelo} en ${ot} = ${esperado}`, async (ctx) => {
        const id = await pedidoIdPorOt(ot);
        if (!id) {
          console.warn(`[test:db] La OT ${ot} no está cargada: se omite ${modelo}.`);
          return ctx.skip();
        }
        expect(await cantidadPm(id, modelo)).toBe(esperado);
      });
    }
  });
});
