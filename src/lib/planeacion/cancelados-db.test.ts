import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ErrorLectura } from "@/lib/supabase/paginar";
import { cargarCancelados, enLotes, versionQueCuenta, IDS_POR_LOTE } from "./cancelados-db";

type Fila = Record<string, unknown>;

// Base falsa en memoria: filtra, ordena y pagina como la real, y corta cada respuesta en 1000 filas SIN avisar
// (por eso una lectura sin paginar se quedaría incompleta aquí también).
function baseFalsa(tablas: Record<string, Fila[]>, opciones: { falla?: string } = {}) {
  const llamadas: { tabla: string; ids: number }[] = [];
  const from = (tabla: string) => {
    const filtros: ((f: Fila) => boolean)[] = [];
    const orden: { col: string; asc: boolean }[] = [];
    let rango: [number, number] | null = null;
    const consulta = {
      select: () => consulta,
      eq: (col: string, v: unknown) => (filtros.push((f) => f[col] === v), consulta),
      is: (col: string, v: null) => (filtros.push((f) => (f[col] ?? null) === v), consulta),
      not: (col: string, _op: string, v: null) => (filtros.push((f) => (f[col] ?? null) !== v), consulta),
      in: (col: string, vals: unknown[]) => {
        llamadas.push({ tabla, ids: vals.length });
        filtros.push((f) => vals.includes(f[col]));
        return consulta;
      },
      order: (col: string, o?: { ascending?: boolean }) => (orden.push({ col, asc: o?.ascending !== false }), consulta),
      range: (a: number, b: number) => ((rango = [a, b]), consulta),
      returns: () => consulta,
      then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        if (opciones.falla === tabla) return Promise.resolve({ data: null, error: { message: "falla de prueba" } }).then(ok, ko);
        let filas = (tablas[tabla] ?? []).filter((f) => filtros.every((fn) => fn(f)));
        for (const { col, asc } of [...orden].reverse()) {
          filas = [...filas].sort((x, y) => (x[col]! < y[col]! ? -1 : x[col]! > y[col]! ? 1 : 0) * (asc ? 1 : -1));
        }
        const [a, b] = rango ?? [0, 999];
        filas = filas.slice(a, Math.min(b, a + 999) + 1); // tope de 1000 filas por respuesta
        return Promise.resolve({ data: filas, error: null }).then(ok, ko);
      },
    };
    return consulta;
  };
  return { cliente: { from } as unknown as SupabaseClient, llamadas };
}

interface Escenario {
  pedidos: Fila[];
  versiones: Fila[];
  items: Fila[];
}

// n pedidos con una versión activa y `porPedido` muebles cada uno. Los índices de `canceladoEntero`,
// `conItemCancelado` y `conPapelera` marcan cuáles tienen algo.
function escenario(
  n: number,
  porPedido: number,
  marcas: { canceladoEntero?: number[]; conItemCancelado?: number[]; conPapelera?: number[]; eliminado?: number[]; pendientes?: number[] } = {}
): Escenario {
  const e: Escenario = { pedidos: [], versiones: [], items: [] };
  for (let i = 0; i < n; i++) {
    const id = `p${String(i).padStart(5, "0")}`;
    const vid = `v${String(i).padStart(5, "0")}`;
    e.pedidos.push({
      id,
      numero_pedido: `PM${i}-26`,
      created_at: `2026-01-${String(1 + (i % 28)).padStart(2, "0")}T00:00:${String(i % 60).padStart(2, "0")}Z`,
      cancelado_en: marcas.canceladoEntero?.includes(i) ? "2026-02-01T00:00:00Z" : null,
      motivo_cancelacion: null,
      eliminado_definitivo_en: null,
      eliminado_en: marcas.eliminado?.includes(i) ? "2026-02-01T00:00:00Z" : null,
      proyectos: { nombre: `Proyecto ${i}`, cliente: "C" },
      pedido_versiones: [{ id: vid, numero_version: 1, es_version_activa: true }],
    });
    e.versiones.push({ id: vid, pedido_id: id });
    for (let k = 0; k < porPedido; k++) {
      e.items.push({
        id: `i${String(i).padStart(5, "0")}-${k}`,
        item_code: k + 1,
        pedido_version_id: vid,
        estado_revision: marcas.conItemCancelado?.includes(i) && k === 0 ? "cancelado" : null,
        estado_liberacion: marcas.pendientes?.includes(i) && k === 0 ? "pendiente" : "enviado_a_produccion",
        eliminacion_solicitada_en: marcas.conPapelera?.includes(i) && k === 1 ? "2026-03-01T00:00:00Z" : null,
        cantidad_total: 1,
      });
    }
  }
  return e;
}

const tablasDe = (e: Escenario) => ({ pedidos: e.pedidos, pedido_versiones: e.versiones, planeacion_items: e.items });

describe("enLotes", () => {
  it("parte la lista en lotes que caben en la URL", () => {
    expect(enLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(enLotes([])).toEqual([]);
    expect(IDS_POR_LOTE).toBe(100);
  });
});

describe("versionQueCuenta", () => {
  it("la activa; si no hay, la de número más alto; sin versiones, null", () => {
    expect(versionQueCuenta({ pedido_versiones: [{ id: "a", numero_version: 1, es_version_activa: false }, { id: "b", numero_version: 2, es_version_activa: true }] })).toBe("b");
    expect(versionQueCuenta({ pedido_versiones: [{ id: "a", numero_version: 1, es_version_activa: false }, { id: "b", numero_version: 3, es_version_activa: false }] })).toBe("b");
    expect(versionQueCuenta({ pedido_versiones: [] })).toBeNull();
  });
});

describe("cargarCancelados", () => {
  it("con 2500 pedidos trae solo los que tienen algo, y todos sus muebles para contar", async () => {
    const e = escenario(2500, 3, { canceladoEntero: [10, 20, 30], conItemCancelado: [100, 1500, 2400, 2499], eliminado: [2000] });
    const { cliente, llamadas } = baseFalsa(tablasDe(e));
    const r = await cargarCancelados(cliente);

    expect(r.pedidos.map((p) => p.id).sort()).toEqual(
      [10, 20, 30, 100, 1500, 2400, 2499].map((i) => `p${String(i).padStart(5, "0")}`).sort()
    );
    // De cada uno vienen sus 3 muebles (para saber cuántos están cancelados del total), no los 7500 de la base.
    expect(r.itemsEstado).toHaveLength(7 * 3);
    expect(r.versionPorPedido.get("p00100")).toBe("v00100");
    // Ningún .in() manda más ids de los que caben en la URL.
    expect(Math.max(...llamadas.map((l) => l.ids))).toBeLessThanOrEqual(IDS_POR_LOTE);
    // Sin papelera pedida, no se leen esos muebles.
    expect(r.itemsPapelera).toEqual([]);
  });

  it("un pedido eliminado (papelera de pedidos) no sale aunque tenga muebles cancelados", async () => {
    const e = escenario(50, 2, { conItemCancelado: [5], eliminado: [5] });
    const r = await cargarCancelados(baseFalsa(tablasDe(e)).cliente);
    expect(r.pedidos).toEqual([]);
  });

  it("no se queda corto con más de 1000 pedidos con muebles cancelados (pagina y pide por lotes)", async () => {
    const todos = Array.from({ length: 1500 }, (_, i) => i);
    const e = escenario(1500, 2, { conItemCancelado: todos });
    const { cliente, llamadas } = baseFalsa(tablasDe(e));
    const r = await cargarCancelados(cliente);
    expect(r.pedidos).toHaveLength(1500);
    expect(r.itemsEstado).toHaveLength(3000); // 1500 × 2 muebles: más de 1000, en varias páginas
    expect(new Set(r.pedidos.map((p) => p.id)).size).toBe(1500); // sin repetidos entre páginas
    expect(Math.max(...llamadas.map((l) => l.ids))).toBeLessThanOrEqual(IDS_POR_LOTE);
  });

  it("los pedidos salen del más reciente al más antiguo", async () => {
    const e = escenario(40, 1, { canceladoEntero: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    const r = await cargarCancelados(baseFalsa(tablasDe(e)).cliente);
    const fechas = r.pedidos.map((p) => p.created_at);
    expect(fechas).toEqual([...fechas].sort().reverse());
  });

  it("con incluirPapelera, trae también los pedidos y muebles de la papelera de muebles", async () => {
    const e = escenario(300, 3, { conPapelera: [7, 250] });
    const sin = await cargarCancelados(baseFalsa(tablasDe(e)).cliente);
    expect(sin.pedidos).toEqual([]);
    const r = await cargarCancelados(baseFalsa(tablasDe(e)).cliente, { incluirPapelera: true });
    expect(r.pedidos.map((p) => p.id).sort()).toEqual(["p00007", "p00250"]);
    expect(r.itemsPapelera.map((i) => i.id).sort()).toEqual(["i00007-1", "i00250-1"]);
  });

  it("con soloLiberados, no cuenta lo que nunca se envió a Producción", async () => {
    // El mueble 0 del pedido 5 está cancelado pero sigue pendiente: Calidad no lo ve.
    const e = escenario(20, 2, { conItemCancelado: [5, 6], pendientes: [5] });
    const todos = await cargarCancelados(baseFalsa(tablasDe(e)).cliente);
    expect(todos.pedidos.map((p) => p.id).sort()).toEqual(["p00005", "p00006"]);
    const soloCalidad = await cargarCancelados(baseFalsa(tablasDe(e)).cliente, { soloLiberados: true });
    expect(soloCalidad.pedidos.map((p) => p.id)).toEqual(["p00006"]);
    expect(soloCalidad.itemsEstado.every((i) => i.estado_revision !== "cancelado" || i.pedido_version_id === "v00006")).toBe(true);
  });

  it("si una lectura falla lanza ErrorLectura en vez de devolver una lista parcial", async () => {
    const e = escenario(10, 1, { canceladoEntero: [1] });
    await expect(cargarCancelados(baseFalsa(tablasDe(e), { falla: "pedidos" }).cliente)).rejects.toBeInstanceOf(ErrorLectura);
    await expect(cargarCancelados(baseFalsa(tablasDe(e), { falla: "planeacion_items" }).cliente)).rejects.toBeInstanceOf(ErrorLectura);
  });

  it("sin nada cancelado devuelve todo vacío", async () => {
    const r = await cargarCancelados(baseFalsa(tablasDe(escenario(30, 2))).cliente, { incluirPapelera: true });
    expect(r.pedidos).toEqual([]);
    expect(r.itemsEstado).toEqual([]);
    expect(r.versionPorPedido.size).toBe(0);
  });
});
