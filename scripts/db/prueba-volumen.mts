// Prueba de volumen del inicio de Producción (SOLO LECTURA): cuánto tarda y cuántas peticiones hace la
// lectura del flujo de los muebles al crecer su cantidad, y cuánto pesa lo que se manda a la pantalla.
//
//   npm run db:volumen                 muebles simulados: 232, 500, 1000 y 2000
//   npm run db:volumen -- 5000 10000   los tamaños que se pidan
//
// Usa la clave de servicio de .env.local: apunta a PRODUCCIÓN. Solo hace lecturas (SELECT), pero con tamaños
// grandes manda cientos de peticiones: no correrlo en horas de mucho uso con miles de muebles.
// Para simular más muebles repite los ids reales (las consultas cuestan lo mismo que con ids distintos).
// Mide con la clave de servicio, que se salta RLS: con la sesión de una persona tarda algo más.
//
// Referencia (13 nov 2026, tandas de 100 muebles con paginación, de a 6): 1000 muebles ≈ 2.7 s y 91 peticiones;
// 2000 ≈ 4.5 s y 181; nunca más de ~31 peticiones a la vez. (Antes, con tandas de 25: 4.3 s y 171; 7 s y 341.) Hacia la pantalla viaja ~1.5 KB por tarjeta del tablero.

import { createClient } from "@supabase/supabase-js";
import { armarBitacora } from "../../src/lib/produccion/bitacora.ts";
import { renglonesDeTablero } from "../../src/lib/produccion/control-taller.ts";
import { cargarFlujoMuebles } from "../../src/lib/produccion/flujo-db.ts";
import { conEnCalidad, modelosRecientes, type MuebleInicio } from "../../src/lib/produccion/inicio.ts";
import { tarjetasDeControl } from "../../src/lib/produccion/tablero.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}

const tamanos = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
if (tamanos.length === 0) tamanos.push(232, 500, 1000, 2000);

// Cuenta las peticiones a la base y cuántas van a la vez.
let peticiones = 0;
let fallidas = 0;
let maxSimultaneas = 0;
let enVuelo = 0;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  peticiones++;
  enVuelo++;
  maxSimultaneas = Math.max(maxSimultaneas, enVuelo);
  try {
    const r = await fetchOriginal(...args);
    if (!r.ok) fallidas++;
    return r;
  } catch (e) {
    fallidas++;
    throw e;
  } finally {
    enVuelo--;
  }
}) as typeof fetch;

const supabase = createClient(url, clave, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase
  .from("planeacion_items")
  .select("id, item_code, modelo, descripcion, cantidad_total, unidad")
  .eq("tipo_registro", "MO")
  .limit(1000);
if (error || !data?.length) {
  console.error("No se pudieron leer muebles para simular:", error?.message ?? "no hay muebles");
  process.exit(1);
}
const base = data as {
  id: string;
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
}[];
console.log(`Muebles reales para repetir: ${base.length}\n`);

console.log("1) Lectura del flujo (lo que más crece con los muebles liberados)");
for (const n of tamanos) {
  const lista = Array.from({ length: n }, (_, i) => base[i % base.length]);
  peticiones = 0;
  fallidas = 0;
  maxSimultaneas = 0;
  const t0 = performance.now();
  let fallo = "";
  try {
    await cargarFlujoMuebles(supabase, lista);
  } catch (e) {
    fallo = e instanceof Error ? ` · ERROR: ${e.message.slice(0, 120)}` : " · ERROR";
  }
  const ms = Math.round(performance.now() - t0);
  console.log(`   ${n} muebles: ${ms} ms, ${peticiones} peticiones, ${maxSimultaneas} a la vez, ${fallidas} fallidas${fallo}`);
}

console.log("\n2) Lo que se manda a la pantalla (tablero, sin consultas)");
function muebles(n: number): MuebleInicio[] {
  const estados = ["por_liberar", "por_asignar", "en_proceso", "terminado"] as const;
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    modelo: `MODELO-${i % 150}`,
    descripcion: "Descripción de un mueble de ejemplo",
    cantidad: 12,
    unidad: "PZA",
    estado: estados[i % 4],
    pedidoId: `p${i % 60}`,
    numeroPm: `PM${100 + (i % 60)}-26`,
    ot: `${100 + (i % 20)}-26`,
    creadoEn: "2026-11-01T10:00:00Z",
    actividad: `2026-11-${String(1 + (i % 28)).padStart(2, "0")}T10:00:00Z`,
    procesos: [{ etiqueta: "Armado", pct: 40, estado: "en_proceso" as const }],
    faltaAsignar: i % 8 === 1 ? { cantidad: 5, total: 12, etiqueta: "Armado" } : undefined,
    enCalidad: i % 9 === 0 ? 3 : undefined,
  })) as MuebleInicio[];
}
const firma = "t".repeat(300);
for (const n of tamanos) {
  const t0 = performance.now();
  const m = muebles(n);
  const renglones = renglonesDeTablero(conEnCalidad(m, new Map()), armarBitacora([], new Map(), new Map(), "2026-11-12"));
  const imagenes = Object.fromEntries(
    renglones.map((r) => [
      r.planeacionItemId ?? "",
      {
        url: `https://x.supabase.co/storage/v1/object/sign/planeacion-item-imagenes/contenido/v1/${"a".repeat(64)}.webp?token=${firma}`,
        urlGrande: `https://x.supabase.co/storage/v1/object/sign/planeacion-item-imagenes/contenido/v1/${"a".repeat(64)}-hd.webp?token=${firma}`,
      },
    ])
  );
  const tarjetas = tarjetasDeControl(renglones, {
    imagenes,
    conteosPorModelo: new Map(modelosRecientes(m).map((x) => [x.modelo, x.conteos])),
  });
  const ms = Math.round(performance.now() - t0);
  const kb = Math.round(JSON.stringify(tarjetas).length / 1024);
  console.log(`   ${n} muebles → ${tarjetas.length} tarjetas, ${ms} ms en memoria, ${kb} KB hacia la pantalla`);
}
