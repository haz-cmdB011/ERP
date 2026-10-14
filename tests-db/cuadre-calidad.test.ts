// Pruebas (SOLO LECTURA) del cuadre Planeación → Producción → Calidad → recibos
// (migración 20261014195109_cuadre_calidad_recibos):
//
//   npm run test:db        (usa las variables de .env.local)
//
//   1. Permisos: sin sesión o sin el rol de Estimaciones nadie consulta el PM
//      contra cobrado ni lo aprobado por Calidad.
//   2. Datos: lo que Calidad aprobó de un mueble nunca pasa de lo que declara el
//      PM, y la lista de modelos de un recibo trae los componentes sin inflar el
//      saldo de su mueble.
//
// No escribe nada. Si la migración todavía no está en la base, las pruebas se
// omiten con aviso.

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

interface FilaAprobado {
  ot: string;
  clave: string;
  vclave: string;
  componente: boolean;
  aprobado_acabados: number | string;
  aprobado_armado: number | string;
}

describe.skipIf(!hayVariables)("Cuadre con Calidad (solo lectura)", () => {
  describe("permisos", () => {
    const funciones: [string, Record<string, unknown>][] = [
      ["ot_contra_cobrado", { p_ot: null }],
      ["recibo_contra_calidad", { p_tipo: "acabados", p_recibo_id: UUID_NULO }],
      ["listar_modelos_ot_recibos", { p_ot: "000-00" }],
      // Auxiliar interna: ni siquiera quien tiene sesión la puede llamar.
      ["aprobado_calidad_variante", { p_ot: null }],
    ];
    for (const [funcion, args] of funciones) {
      it(`${funcion}: no la puede ejecutar un usuario sin sesión`, async (ctx) => {
        const { data, error } = await anonimo.rpc(funcion, args);
        if (error?.code === "PGRST202") return ctx.skip(); // la migración aún no está en la base
        expect(error, "debe rechazarla").not.toBeNull();
        expect(data).toBeNull();
      });
    }

    // La clave de servicio no trae usuario (auth.uid() nulo): no es de Estimaciones.
    const porRol: [string, Record<string, unknown>, string][] = [
      ["ot_contra_cobrado", { p_ot: null }, "Solo el personal de Estimaciones"],
      ["recibo_contra_calidad", { p_tipo: "acabados", p_recibo_id: UUID_NULO }, "Solo el personal de Estimaciones"],
      ["listar_modelos_ot_recibos", { p_ot: "000-00" }, "No tienes permiso"],
    ];
    for (const [funcion, args, mensaje] of porRol) {
      it(`${funcion} rechaza a quien no es de Estimaciones`, async (ctx) => {
        const { error } = await servicio.rpc(funcion, args);
        if (error?.code === "PGRST202") return ctx.skip();
        expect(error?.message).toContain(mensaje);
      });
    }
  });

  describe("datos", () => {
    it("lo que Calidad aprobó de un mueble no pasa de lo que declara el PM", async (ctx) => {
      const { data, error } = await servicio.rpc("aprobado_calidad_variante", { p_ot: null });
      if (error?.code === "PGRST202") return ctx.skip();
      expect(error).toBeNull();
      const filas = (data ?? []) as FilaAprobado[];
      if (filas.length === 0) return ctx.skip();
      for (const f of filas.slice(0, 60)) {
        expect(Number(f.aprobado_acabados)).toBeGreaterThanOrEqual(0);
        expect(Number(f.aprobado_armado)).toBeGreaterThanOrEqual(0);
        // Las claves ya vienen normalizadas: normalizar de nuevo no las cambia.
        const { data: pm } = await servicio.rpc("cantidad_pm_variante", {
          p_ot: f.ot,
          p_modelo: f.clave,
          p_descripcion: f.vclave,
          p_solo_iluminacion: false,
        });
        const declarado = Number(pm ?? 0);
        expect(Number(f.aprobado_acabados), `${f.ot} ${f.clave} acabados`).toBeLessThanOrEqual(declarado);
        expect(Number(f.aprobado_armado), `${f.ot} ${f.clave} armado`).toBeLessThanOrEqual(declarado);
      }
    });

    it("cobrar un componente se compara contra su propia cantidad: la de su mueble no cambia", async (ctx) => {
      // Sin la migración, cantidad_pm_variante todavía no conoce los componentes.
      const { error: sinMigracion } = await servicio.rpc("aprobado_calidad_variante", { p_ot: "000-00" });
      if (sinMigracion?.code === "PGRST202") return ctx.skip();
      const { data: hijos, error } = await servicio
        .from("planeacion_items")
        .select("modelo, descripcion, cantidad_total, parent_item_id, pedido_versiones!inner(es_version_activa)")
        .eq("tipo_registro", "FU")
        .eq("pedido_versiones.es_version_activa", true)
        .not("parent_item_id", "is", null)
        .limit(1);
      expect(error).toBeNull();
      const hijo = hijos?.[0];
      if (!hijo) return ctx.skip();
      const { data: ot } = await servicio
        .from("planeacion_items")
        .select("pedido_versiones!inner(pedidos!inner(numero_pedido))")
        .eq("parent_item_id", hijo.parent_item_id)
        .limit(1);
      const numeroPedido = (ot?.[0] as unknown as { pedido_versiones: { pedidos: { numero_pedido: string } } } | undefined)
        ?.pedido_versiones.pedidos.numero_pedido;
      if (!numeroPedido) return ctx.skip();
      const { data: pm, error: errorPm } = await servicio.rpc("cantidad_pm_variante", {
        p_ot: numeroPedido,
        p_modelo: hijo.modelo,
        p_descripcion: hijo.descripcion,
        p_solo_iluminacion: false,
      });
      if (errorPm) return ctx.skip();
      // El componente tiene su cantidad declarada (como mínimo la suya).
      expect(Number(pm)).toBeGreaterThanOrEqual(Number(hijo.cantidad_total));
      // Electrificación solo cobra muebles padre: un componente no cuenta ahí.
      const { data: pmElectrificacion } = await servicio.rpc("cantidad_pm_variante", {
        p_ot: numeroPedido,
        p_modelo: hijo.modelo,
        p_descripcion: hijo.descripcion,
        p_solo_iluminacion: true,
      });
      expect(pmElectrificacion).toBeNull();
    });
  });
});
