import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Dos reglas que evitan que una falla de la base se vea como "no hay datos":
//
//  1. Las páginas y layouts de servidor no hacen `const { data } = await supabase…` ignorando el
//     error: usan leer() (src/lib/supabase/leer.ts), que lanza ErrorLectura. La consulta de perfil
//     (rol y área, que solo decide qué botones se ven) queda fuera.
//  2. Todo error.tsx usa `retry` (vuelve a pedir los datos) y no `reset` (solo limpia el error sin
//     volver a leer), que en Next 16.3 no sirve para fallas de lectura.

const RAIZ_APP = join(__dirname);

function archivos(dir: string, filtro: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivos(ruta, filtro);
    return filtro.test(e.name) ? [ruta] : [];
  });
}

const esCliente = (t: string) => /^\s*(?:\/\/[^\n]*\n\s*)*["']use client["']/.test(t);

function raizDe(n: ts.Node): string | null {
  let x: ts.Node = n;
  for (;;) {
    if (ts.isCallExpression(x) || ts.isPropertyAccessExpression(x) || ts.isNonNullExpression(x) || ts.isParenthesizedExpression(x)) x = x.expression;
    else break;
  }
  return ts.isIdentifier(x) ? x.text : null;
}

function tablaDe(n: ts.Node): string | null {
  let nombre: string | null = null;
  const visita = (x: ts.Node) => {
    if (
      ts.isCallExpression(x) &&
      ts.isPropertyAccessExpression(x.expression) &&
      ["from", "rpc"].includes(x.expression.name.text) &&
      x.arguments[0] &&
      ts.isStringLiteral(x.arguments[0])
    ) {
      nombre = x.arguments[0].text;
    }
    ts.forEachChild(x, visita);
  };
  visita(n);
  return nombre;
}

/** Líneas con `const { data } = await supabase…` (o su forma condicional) que ignoran el error. */
export function lecturasQueIgnoranElError(codigo: string): { linea: number; tabla: string | null }[] {
  const fuente = ts.createSourceFile("p.tsx", codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hallazgos: { linea: number; tabla: string | null }[] = [];
  const visita = (n: ts.Node) => {
    if (ts.isVariableStatement(n) && n.declarationList.declarations.length === 1) {
      const d = n.declarationList.declarations[0];
      if (ts.isObjectBindingPattern(d.name) && d.name.elements.length === 1 && d.initializer) {
        const el = d.name.elements[0];
        const clave = el.propertyName ? el.propertyName.getText() : el.name.getText();
        const ini = d.initializer;
        const consulta =
          ts.isAwaitExpression(ini) && raizDe(ini.expression) === "supabase"
            ? ini
            : ts.isConditionalExpression(ini) && ts.isAwaitExpression(ini.whenTrue) && raizDe(ini.whenTrue.expression) === "supabase"
              ? ini.whenTrue
              : null;
        if (clave === "data" && ts.isIdentifier(el.name) && consulta) {
          const tabla = tablaDe(consulta);
          // Solo consultas de tabla o función (.from/.rpc): auth.getUser() devuelve { data: { user } }.
          if (tabla !== null && tabla !== "perfiles") {
            hallazgos.push({ linea: fuente.getLineAndCharacterOfPosition(n.getStart()).line + 1, tabla });
          }
        }
      }
    }
    ts.forEachChild(n, visita);
  };
  visita(fuente);
  return hallazgos;
}

describe("detector de lecturas que ignoran el error", () => {
  it("marca `const { data } = await supabase…` y su forma condicional, salvo la de perfiles", () => {
    const codigo = `
async function a() {
  const { data: pedidos } = await supabase.from("pedidos").select("*");
  const { data: items } = ids.length ? await supabase.from("planeacion_items").select("*") : { data: [] };
  const { data: perfil } = await supabase.from("perfiles").select("rol").maybeSingle();
  const { data: ok, error } = await supabase.from("x").select("*");
  const bien = await leer(supabase.from("y").select("*"), "y");
  const { data: { user } } = await supabase.auth.getUser();
}`;
    expect(lecturasQueIgnoranElError(codigo)).toEqual([
      { linea: 3, tabla: "pedidos" },
      { linea: 4, tabla: "planeacion_items" },
    ]);
  });
});

describe("páginas de servidor", () => {
  it("leen con leer() en vez de ignorar el error de la consulta", () => {
    const problemas: string[] = [];
    for (const archivo of archivos(RAIZ_APP, /^(page|layout)\.tsx$/)) {
      const texto = readFileSync(archivo, "utf8");
      if (esCliente(texto)) continue;
      for (const h of lecturasQueIgnoranElError(texto)) {
        problemas.push(`${relative(RAIZ_APP, archivo).replace(/\\/g, "/")}:${h.linea} (${h.tabla ?? "?"})`);
      }
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});

describe("pantallas de error", () => {
  it("usan retry (vuelve a leer) y no reset", () => {
    const problemas: string[] = [];
    for (const archivo of archivos(RAIZ_APP, /^(global-)?error\.tsx$/)) {
      // Sin comentarios: el aviso de por qué se usa retry menciona la palabra reset.
      const texto = readFileSync(archivo, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      if (/\breset\b/.test(texto)) problemas.push(`${relative(RAIZ_APP, archivo).replace(/\\/g, "/")} usa reset`);
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});
