// Prueba (SOLO LECTURA) de las lecturas paginadas de Estimaciones: contra la
// base real comprueba que las listas traen TODAS las filas (la API corta en
// 1000) y que ninguna lectura falla en silencio.
//
//   npm run test:db        (usa las variables de .env.local)

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { contarRecibosPorEstado, listarPendientesDeRevision } from "../src/lib/estimaciones/por-revisar";
import { cargarHistoricoDb, listarRecibos } from "../src/lib/estimaciones/recibos-db";
import {
  cargarPreciosPagadosElectrificacion,
  listarFoliosElectrificacion,
  listarRecibosElectrificacion,
} from "../src/lib/estimaciones/recibos-electrificacion-db";
import { listarResumenDiscrepancias } from "../src/lib/estimaciones/discrepancias-resumen";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hayVariables = Boolean(url && serviceKey);
const servicio = hayVariables
  ? createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  : (null as never as SupabaseClient);

async function contar(tabla: string): Promise<number> {
  const { count, error } = await servicio.from(tabla).select("id", { count: "exact", head: true });
  expect(error, `no se pudo contar ${tabla}`).toBeNull();
  return count ?? 0;
}

describe.skipIf(!hayVariables)("lecturas de Estimaciones (solo lectura)", () => {
  it("la lista de recibos trae todos, sin quedarse en 1000", async () => {
    const [lista, total] = await Promise.all([listarRecibos(servicio), contar("recibos")]);
    expect(lista).toHaveLength(total);
  });

  it("la lista de Electrificación trae todos", async () => {
    const [lista, total] = await Promise.all([
      listarRecibosElectrificacion(servicio),
      contar("recibos_electrificacion"),
    ]);
    expect(lista).toHaveLength(total);
  });

  it("los pendientes por revisar coinciden con el contador", async () => {
    const [lista, contador] = await Promise.all([
      listarPendientesDeRevision(servicio),
      contarRecibosPorEstado(servicio, "pendiente"),
    ]);
    expect(lista).toHaveLength(contador);
  });

  it("el resumen de discrepancias trae todas", async () => {
    const [lista, total] = await Promise.all([
      listarResumenDiscrepancias(servicio),
      contar("discrepancias_pm"),
    ]);
    expect(lista).toHaveLength(total);
  });

  it("el histórico y los folios se leen sin fallar", async () => {
    await expect(cargarHistoricoDb(servicio, "acabados")).resolves.toBeInstanceOf(Array);
    await expect(cargarHistoricoDb(servicio, "armado")).resolves.toBeInstanceOf(Array);
    await expect(cargarPreciosPagadosElectrificacion(servicio)).resolves.toBeInstanceOf(Array);
    await expect(listarFoliosElectrificacion(servicio)).resolves.toBeInstanceOf(Array);
  });
});
