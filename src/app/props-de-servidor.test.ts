import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Next rechaza al PINTAR la pantalla (no al compilar) que un componente de servidor le
// pase una función a un componente de cliente: el fallo solo aparece en el navegador de
// quien abre esa pantalla. Así se rompió el escáner de QR. Esta prueba busca, en los
// archivos que NO son de cliente, atributos JSX con una función flecha como valor cuyo
// componente receptor SÍ es de cliente ("use client").
//
// Pasarle funciones a otro componente de servidor es válido (p. ej. <Paginacion
// href={(n) => ...}>), y `action` en un <form> es una Server Action: ambos se ignoran.

const RAIZ_SRC = join(__dirname, "..");
const ATRIBUTO_CON_FUNCION = /\s([a-zA-Z]+)=\{\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_]+)\s*=>/g;
const ETIQUETA = /<([A-Z][A-Za-z0-9]*)\b/g;
const IMPORTACION = /import\s+(?:([A-Za-z_]\w*)|\{([^}]*)\})(?:\s*,\s*\{([^}]*)\})?\s+from\s+["']([^"']+)["']/g;

const esDeCliente = (texto: string) => /^\s*(?:\/\/[^\n]*\n\s*)*["']use client["']/.test(texto);

/** Módulo importado por cada nombre: { Paginacion: "@/components/paginacion" }. */
function importaciones(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of texto.matchAll(IMPORTACION)) {
    if (m[1]) mapa.set(m[1], m[4]);
    for (const grupo of [m[2], m[3]]) {
      for (const parte of (grupo ?? "").split(",")) {
        const nombre = parte.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, "").trim();
        if (nombre) mapa.set(nombre, m[4]);
      }
    }
  }
  return mapa;
}

function leerModulo(archivo: string, modulo: string): string | null {
  const base = modulo.startsWith("@/") ? join(RAIZ_SRC, modulo.slice(2)) : modulo.startsWith(".") ? join(dirname(archivo), modulo) : null;
  if (!base) return null; // paquete externo: no se revisa
  for (const candidato of [`${base}.tsx`, join(base, "index.tsx"), `${base}.ts`]) {
    if (existsSync(candidato)) return readFileSync(candidato, "utf8");
  }
  return null;
}

/** Atributos con función que reciben componentes de cliente, en un archivo de servidor. */
export function funcionesHaciaCliente(
  texto: string,
  esClienteElModulo: (modulo: string) => boolean
): { atributo: string; componente: string; linea: number }[] {
  if (esDeCliente(texto)) return [];
  const importados = importaciones(texto);
  const etiquetas = [...texto.matchAll(ETIQUETA)];
  const encontrados: { atributo: string; componente: string; linea: number }[] = [];
  for (const m of texto.matchAll(ATRIBUTO_CON_FUNCION)) {
    if (m[1] === "action") continue;
    const previa = etiquetas.filter((e) => (e.index ?? 0) < (m.index ?? 0)).at(-1);
    const componente = previa?.[1];
    const modulo = componente ? importados.get(componente) : undefined;
    if (componente && modulo && esClienteElModulo(modulo)) {
      encontrados.push({ atributo: m[1], componente, linea: texto.slice(0, m.index).split("\n").length });
    }
  }
  return encontrados;
}

function archivosTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivosTsx(ruta);
    return /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [ruta] : [];
  });
}

describe("detector de funciones hacia componentes de cliente", () => {
  const paginaConFuncion = `import EscanerQr from "@/components/escaner-qr";
import Paginacion from "@/components/paginacion";
export default function Pagina() {
  return (
    <main>
      <EscanerQr
        rutaItem={(id) => \`/produccion/escanear/\${id}\`}
        placeholderFolio="x"
      />
      <Paginacion href={(n) => \`?p=\${n}\`} />
      <form action={async () => {}}></form>
    </main>
  );
}`;

  it("marca el caso que rompió el escáner (función hacia un componente de cliente)", () => {
    const r = funcionesHaciaCliente(paginaConFuncion, (m) => m === "@/components/escaner-qr");
    expect(r).toEqual([{ atributo: "rutaItem", componente: "EscanerQr", linea: 7 }]);
  });

  it("deja pasar funciones hacia componentes de servidor y las Server Actions", () => {
    expect(funcionesHaciaCliente(paginaConFuncion, () => false)).toEqual([]);
  });

  it("no revisa archivos que ya son de cliente", () => {
    expect(funcionesHaciaCliente(`"use client";\n${paginaConFuncion}`, () => true)).toEqual([]);
  });
});

describe("componentes de servidor", () => {
  it("no pasan funciones a componentes de cliente (solo se pueden pasar datos)", () => {
    const problemas: string[] = [];
    for (const archivo of archivosTsx(join(RAIZ_SRC, "app"))) {
      const texto = readFileSync(archivo, "utf8");
      const hallazgos = funcionesHaciaCliente(texto, (modulo) => {
        const contenido = leerModulo(archivo, modulo);
        return contenido !== null && esDeCliente(contenido);
      });
      for (const h of hallazgos) {
        problemas.push(`${relative(RAIZ_SRC, archivo).replace(/\\/g, "/")}:${h.linea} → <${h.componente} ${h.atributo}={función}>`);
      }
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});
