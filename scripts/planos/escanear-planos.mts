/**
 * Reporte (SOLO LECTURA) de los planos de Ingeniería vs. los modelos de la app.
 *
 * Recorre el servidor de Ingeniería (ver escaneo.mts) y compara los modelos
 * encontrados contra los modelos de los pedidos que ya están en la app, con
 * la misma regla que usa la app para mostrar los planos (elegirPlanos). No
 * sube nada ni escribe en la base de datos: solo genera un reporte.
 *
 * Uso:
 *   node scripts/planos/escanear-planos.mts [--raiz I:/] [--anios 2025,2026] [--salida planos-reporte]
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizarNumeroPM } from "../../src/lib/planeacion/numero-pm.ts";
import { elegirPlanos, normalizarModelo } from "../../src/lib/planos/modelo.ts";
import { aniosPorDefecto, arg, escanear, leerEnv } from "./escaneo.mts";

const RAIZ = arg("raiz", "I:/");
const ANIOS = arg("anios", aniosPorDefecto()).split(",").map((a) => a.trim());
const SALIDA = arg("salida", "planos-reporte");

interface ModeloApp {
  pm: string;
  numero_pedido: string;
  proyecto: string;
  item_code: number;
  modelo: string;
}

// Solo SELECT: modelos de la versión activa de los pedidos no eliminados.
async function modelosDeLaApp(): Promise<ModeloApp[]> {
  const env = await leerEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from("planeacion_items")
    .select(
      "item_code, modelo, pedido_versiones!inner ( es_version_activa, pedidos!inner ( numero_pedido, fecha_pedido, eliminado_en, proyectos ( nombre ) ) )"
    )
    .eq("pedido_versiones.es_version_activa", true)
    .is("pedido_versiones.pedidos.eliminado_en", null)
    .not("modelo", "is", null)
    .returns<
      {
        item_code: number;
        modelo: string;
        pedido_versiones: {
          pedidos: {
            numero_pedido: string;
            fecha_pedido: string | null;
            proyectos: { nombre: string } | null;
          };
        };
      }[]
    >();
  if (error) throw new Error(`No se pudieron leer los modelos de la app: ${error.message}`);
  return (data ?? []).map((r) => {
    const p = r.pedido_versiones.pedidos;
    return {
      pm: normalizarNumeroPM(p.numero_pedido, { fechaPedido: p.fecha_pedido }),
      numero_pedido: p.numero_pedido,
      proyecto: p.proyectos?.nombre ?? "",
      item_code: r.item_code,
      modelo: r.modelo,
    };
  });
}

function csv(filas: Record<string, unknown>[]): string {
  if (filas.length === 0) return "";
  const columnas = Object.keys(filas[0]);
  const celda = (v: unknown) => {
    const s = Array.isArray(v) ? v.join(" | ") : String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM para que Excel abra bien los acentos.
  return "﻿" + [columnas.join(","), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(","))].join("\r\n");
}

function pct(n: number, total: number): string {
  return total ? `${((n / total) * 100).toFixed(0)}%` : "—";
}

async function main() {
  console.log(`Escaneando ${RAIZ} (años ${ANIOS.join(", ")})...`);
  const { proyectos, modelos } = await escanear(RAIZ, ANIOS);

  const pdfs = modelos.flatMap((m) => m.planos_pdf);
  const mb = pdfs.reduce((s, p) => s + p.tamano_bytes, 0) / 1024 / 1024;
  console.log("\n== Servidor de Ingeniería");
  console.log(`  Carpetas de proyecto:        ${proyectos.length} (${proyectos.filter((p) => p.pm).length} con número de PM)`);
  console.log(`  Con carpeta INGENIERIA:      ${proyectos.filter((p) => p.tiene_ingenieria).length}`);
  console.log(`  Modelos con plano o cédula:  ${modelos.length}`);
  console.log(`    con plano PDF:             ${modelos.filter((m) => m.planos_pdf.length > 0).length} (${pdfs.length} PDF, ${mb.toFixed(0)} MB)`);
  console.log(`    con cédula:                ${modelos.filter((m) => m.cedulas_xlsx.length > 0).length}`);
  console.log(`    con varios PDF:            ${modelos.filter((m) => m.planos_pdf.length > 1).length}`);

  console.log("\nLeyendo modelos de la app (solo lectura)...");
  const app = await modelosDeLaApp();
  const candidatos = modelos
    .filter((m) => m.planos_pdf.length > 0)
    .map((m) => ({ ...m, anio: Number(m.anio) }));

  const comparacion = app.map((a) => {
    const { planos, deOtroPm } = elegirPlanos(a.modelo, a.pm, candidatos);
    return {
      ...a,
      tipo: planos.length === 0 ? "sin_plano" : deOtroPm ? "otro_pm" : "mismo_pm",
      cancelada: planos.length > 0 && planos.every((p) => p.cancelada),
      pdfs: planos.reduce((s, p) => s + p.planos_pdf.length, 0),
      carpetas: planos.map((p) => p.ruta),
    };
  });

  // Un mismo modelo aparece en varios ítems (padre e hijos): se resume
  // por modelo distinto dentro de cada PM.
  const unicos = new Map<string, (typeof comparacion)[number]>();
  for (const c of comparacion) unicos.set(`${c.pm}|${normalizarModelo(c.modelo)}`, c);
  const resumen = [...unicos.values()];
  const cuenta = (t: string) => resumen.filter((c) => c.tipo === t).length;

  console.log("\n== Modelos de la app vs. planos");
  console.log(`  Modelos distintos en la app: ${resumen.length} (${app.length} ítems)`);
  console.log(`  Con plano en su mismo PM:    ${cuenta("mismo_pm")} (${pct(cuenta("mismo_pm"), resumen.length)})`);
  console.log(`  Con plano en otro PM:        ${cuenta("otro_pm")} (${pct(cuenta("otro_pm"), resumen.length)})`);
  console.log(`  Sin plano encontrado:        ${cuenta("sin_plano")} (${pct(cuenta("sin_plano"), resumen.length)})`);

  const porPm = new Map<string, typeof resumen>();
  for (const c of resumen) porPm.set(c.pm, [...(porPm.get(c.pm) ?? []), c]);
  for (const [pm, lista] of porPm) {
    const carpetaPm = proyectos.find((p) => p.pm === pm);
    console.log(
      `\n  ${pm} (${lista[0].numero_pedido}) — carpeta en servidor: ${carpetaPm ? `"${carpetaPm.nombre}" (${carpetaPm.anio}, ${carpetaPm.modelos} modelos)` : "NO ENCONTRADA"}`
    );
    for (const c of lista.sort((x, y) => x.item_code - y.item_code)) {
      const marca = { mismo_pm: "✓", otro_pm: "~", sin_plano: "✗" }[c.tipo];
      const detalle =
        c.tipo === "sin_plano"
          ? "sin plano"
          : `${c.pdfs} PDF${c.cancelada ? " [CANCELADA]" : ""} — ${c.carpetas.map((r) => path.basename(r)).join(" | ")}`;
      console.log(`    ${marca} ${c.modelo.padEnd(22)} ${detalle}`);
    }
  }

  await mkdir(SALIDA, { recursive: true });
  await writeFile(
    path.join(SALIDA, "modelos-ingenieria.json"),
    JSON.stringify({ generado: new Date().toISOString(), raiz: RAIZ, proyectos, modelos }, null, 2)
  );
  await writeFile(
    path.join(SALIDA, "modelos-ingenieria.csv"),
    csv(
      modelos.map(({ planos_pdf, ...m }) => ({
        ...m,
        planos_pdf: planos_pdf.map((p) => p.nombre),
      }))
    )
  );
  await writeFile(path.join(SALIDA, "comparacion-app.csv"), csv(comparacion));
  console.log(`\nReporte guardado en ${path.resolve(SALIDA)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
