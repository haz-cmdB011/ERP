import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Un `await fetch()` sin try/catch lanza cuando se cae la red o el servidor responde algo
// que no es JSON, y el botón se queda en "Guardando…" para siempre sin avisar (se reprodujo
// en /registro con la red cortada). En la interfaz se usa `fetchJson` (src/lib/http), que
// nunca lanza. Esta prueba falla si algún componente de cliente llama a `fetch` directo y
// sin un try que lo rodee.

const RAIZ_SRC = join(__dirname, "..");

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [ruta] : [];
  });
}

const esDeCliente = (t: string) => /^\s*(?:\/\/[^\n]*\n\s*)*["']use client["']/.test(t);

/** Llamadas a fetch que no están dentro del bloque `try` de una sentencia try/catch. */
export function fetchSinProteger(codigo: string, nombre = "x.tsx"): number[] {
  const fuente = ts.createSourceFile(nombre, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineas: number[] = [];
  const visita = (nodo: ts.Node) => {
    if (ts.isCallExpression(nodo) && ts.isIdentifier(nodo.expression) && nodo.expression.text === "fetch") {
      let hijo: ts.Node = nodo;
      let padre: ts.Node | undefined = nodo.parent;
      let protegido = false;
      while (padre && !ts.isFunctionLike(padre)) {
        if (ts.isTryStatement(padre) && padre.tryBlock === hijo) protegido = true;
        hijo = padre;
        padre = padre.parent;
      }
      if (!protegido) lineas.push(fuente.getLineAndCharacterOfPosition(nodo.getStart()).line + 1);
    }
    ts.forEachChild(nodo, visita);
  };
  visita(fuente);
  return lineas;
}

describe("detector de fetch sin proteger", () => {
  it("marca un fetch suelto y deja pasar el que está dentro de un try", () => {
    const suelto = `"use client";\nasync function a() {\n  const r = await fetch("/x");\n}`;
    const protegido = `"use client";\nasync function a() {\n  try {\n    const r = await fetch("/x");\n  } catch {}\n}`;
    expect(fetchSinProteger(suelto)).toEqual([3]);
    expect(fetchSinProteger(protegido)).toEqual([]);
  });

  it("un fetch en el catch o después del try NO está protegido", () => {
    const enCatch = `async function a() {\n  try {} catch {\n    await fetch("/x");\n  }\n}`;
    expect(fetchSinProteger(enCatch)).toEqual([3]);
  });
});

describe("interfaz", () => {
  it("no llama a fetch sin try en componentes de cliente (usar fetchJson de src/lib/http)", () => {
    const problemas: string[] = [];
    for (const archivo of archivos(RAIZ_SRC)) {
      const texto = readFileSync(archivo, "utf8");
      if (!esDeCliente(texto)) continue;
      for (const linea of fetchSinProteger(texto, archivo)) {
        problemas.push(`${relative(RAIZ_SRC, archivo).replace(/\\/g, "/")}:${linea}`);
      }
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});
