// Prueba (SOLO LECTURA) de las lecturas de Calidad: el avance estricto no falla
// y coincide con el tolerante, y los pedidos se traen completos (la API corta
// en 1000 filas).
//
//   npm run test:db        (usa las variables de .env.local)

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { avancePorPedido, avancePorPedidoEstricto, sumarAvance } from "../src/lib/resumen/avance-items";
import { paginarTodo } from "../src/lib/supabase/paginar";
import { cargarEntregasConInforme, cargarResumenCalidad } from "../src/lib/calidad/resumen-db";
import { porInspeccionar } from "../src/lib/calidad/inspeccion";
import { cargarFoliosParaExcel } from "../src/lib/calidad/folios-consulta";
import { leerFiltrosFolios } from "../src/lib/calidad/folios-filtros";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hayVariables = Boolean(url && serviceKey);
const servicio = hayVariables
  ? createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  : (null as never as SupabaseClient);

describe.skipIf(!hayVariables)("lecturas de Calidad (solo lectura)", () => {
  it("el avance estricto coincide con el tolerante", async () => {
    const [estricto, tolerante] = await Promise.all([
      avancePorPedidoEstricto(servicio, { conCalidad: true }),
      avancePorPedido(servicio, { conCalidad: true }),
    ]);
    expect(sumarAvance(estricto)).toEqual(sumarAvance(tolerante));
  });

  it("la lista de pedidos paginada trae tantos como el conteo", async () => {
    const { count } = await servicio
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .is("eliminado_en", null)
      .is("eliminado_definitivo_en", null);
    const filas = await paginarTodo<{ id: string }>(
      (desde, hasta) =>
        servicio
          .from("pedidos")
          .select("id")
          .is("eliminado_en", null)
          .is("eliminado_definitivo_en", null)
          .order("created_at", { ascending: false })
          .order("id")
          .range(desde, hasta)
          .returns<{ id: string }[]>(),
      { contexto: "los pedidos" }
    );
    expect(filas).toHaveLength(count ?? 0);
  });

  it("el resumen del panel se calcula y es coherente con el avance", async () => {
    const [resumen, avance] = await Promise.all([
      cargarResumenCalidad(servicio),
      avancePorPedidoEstricto(servicio, { conCalidad: true }),
    ]);
    const a = sumarAvance(avance);
    expect(resumen.liberados).toBe(a.liberados);
    expect(resumen.porEvaluar).toBe(a.porEvaluar);
    expect(resumen.evaluados + resumen.porEvaluar).toBe(resumen.liberados);
  });

  it("la bandeja de entregas por inspeccionar se arma sin fallar", async () => {
    const { entregas, ultimoInforme } = await cargarEntregasConInforme(servicio);
    const lista = porInspeccionar(entregas, ultimoInforme);
    expect(lista.length).toBeLessThanOrEqual(entregas.length);
  });

  it("los folios (con la categoría de la vista) coinciden con el conteo", async () => {
    const { count } = await servicio.from("informes_calidad_estado").select("id", { count: "exact", head: true });
    const { filas, truncado } = await cargarFoliosParaExcel(servicio, leerFiltrosFolios({}));
    expect(truncado).toBe(false);
    expect(filas).toHaveLength(count ?? 0);
  });
});
