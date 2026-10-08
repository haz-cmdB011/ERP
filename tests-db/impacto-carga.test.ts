// Prueba (SOLO LECTURA) del aviso de "trabajo en marcha" al cargar una versión
// nueva de un PM: comprueba contra la base real que las consultas de
// src/lib/planeacion/impacto-db.ts existen y que un Excel idéntico a la versión
// activa se reconoce como igual.
//
//   npm run test:db        (usa las variables de .env.local)
//
// Usa un PM que ya tenga ítems liberados; si no hay ninguno cargado se omite
// con aviso. No escribe nada.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { analizarImpactoCarga, versionSinCambios } from "../src/lib/planeacion/impacto-db";
import type { PlaneacionItemParsed } from "../src/lib/planeacion/types";
import { cargarItemsVersion } from "../src/lib/planeacion/versiones-db";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hayVariables = Boolean(url && serviceKey);
const servicio = hayVariables
  ? createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  : (null as never as SupabaseClient);

interface FilaLiberada {
  pedido_version_id: string;
  pedido_versiones: { pedidos: { numero_pedido: string; archivo_origen: string | null } };
}

describe.skipIf(!hayVariables)("impacto de cargar una versión nueva (solo lectura)", () => {
  it("un Excel idéntico a la versión activa se reconoce como igual y cuenta lo liberado", async () => {
    const { data } = await servicio
      .from("planeacion_items")
      .select(
        "pedido_version_id, pedido_versiones!inner ( es_version_activa, pedidos!inner ( numero_pedido, archivo_origen, eliminado_en, eliminado_definitivo_en ) )"
      )
      .eq("estado_liberacion", "enviado_a_produccion")
      .eq("pedido_versiones.es_version_activa", true)
      .is("pedido_versiones.pedidos.eliminado_en", null)
      .is("pedido_versiones.pedidos.eliminado_definitivo_en", null)
      .not("pedido_versiones.pedidos.archivo_origen", "is", null)
      .limit(1)
      .returns<FilaLiberada[]>();
    const fila = data?.[0];
    if (!fila) {
      console.warn("No hay ningún PM con ítems liberados: se omite la prueba de impacto.");
      return;
    }

    const numeroPedido = fila.pedido_versiones.pedidos.numero_pedido;
    const archivoOrigen = fila.pedido_versiones.pedidos.archivo_origen!;
    const antes = await cargarItemsVersion(servicio, fila.pedido_version_id);
    expect(antes, "no se pudieron leer los ítems de la versión activa").not.toBeNull();

    // El Excel "idéntico": los mismos ítems de la versión activa, con la forma
    // que entrega el parser.
    const items: PlaneacionItemParsed[] = antes!.map((a) => ({
      item_code: a.itemCode,
      tipo_registro: a.tipoRegistro,
      categoria_componente: null,
      tipo_material: a.tipoMaterial,
      etapa: a.etapa,
      nivel: a.nivel,
      departamento: a.departamento,
      elevacion: a.elevacion,
      modelo: a.modelo,
      descripcion: a.descripcion,
      cantidad_x_mueble: a.cantidadXMueble,
      unidad: a.unidad,
      cantidad_total: a.cantidadTotal,
      acabados: a.acabados,
      observaciones: a.observaciones,
      fila_excel_origen: a.fila ?? 0,
      imagenes: [],
      ingenieria: null,
      lista_insumos: null,
      suministro_mats: null,
      fases_taller: {},
    }));

    const impactos = await analizarImpactoCarga(servicio, [{ nombreHoja: "PEDIDO", numeroPedido, archivoOrigen, items }]);

    expect(impactos).toHaveLength(1);
    const [impacto] = impactos;
    expect(impacto.numeroPedido).toBe(numeroPedido);
    expect(impacto.igual, "el mismo contenido debe salir como sin cambios").toBe(true);
    expect(impacto.enMarcha.itemsLiberados).toBeGreaterThan(0);
    expect(impacto.enMarcha.mueblesLiberados).toBeLessThanOrEqual(impacto.enMarcha.itemsLiberados);
    expect(impacto.versionNueva).toBeGreaterThan(impacto.versionActiva);
    expect(impacto.itemsNuevos).toBe(items.length);

    // Un archivo es un PM: el mismo Excel sin cambios no crea versión nueva;
    // con una cantidad distinta, sí.
    const igual = await versionSinCambios(servicio, archivoOrigen, items);
    expect(igual?.numeroVersion).toBe(impacto.versionActiva);
    const otro = items.map((i, n) => (n === 0 ? { ...i, cantidad_total: i.cantidad_total + 1 } : i));
    expect(await versionSinCambios(servicio, archivoOrigen, otro)).toBeNull();
  });

  it("un archivo que no se ha subido no tiene nada en marcha", async () => {
    const impactos = await analizarImpactoCarga(servicio, [
      { nombreHoja: "PEDIDO", numeroPedido: "9PM999-99", archivoOrigen: "ARCHIVO QUE NO EXISTE 999-99", items: [] },
    ]);
    expect(impactos).toEqual([]);
  });
});
