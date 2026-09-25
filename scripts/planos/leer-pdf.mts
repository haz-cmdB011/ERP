// Lee un plano PDF y extrae sus especificaciones del cuadro de datos (ver
// src/lib/planos/cuadro-datos.ts). El PDF no se guarda en ningún lado: solo
// se extrae texto.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile } from "node:fs/promises";
import {
  extraerEspecificaciones,
  type EspecificacionesPlano,
  type TextoPdf,
} from "../../src/lib/planos/cuadro-datos.ts";

// Tope del texto completo que se guarda (para búsquedas): los planos de
// muchas hojas pueden traer cientos de cotas y anotaciones.
const MAX_TEXTO = 20_000;

export interface PlanoLeido extends EspecificacionesPlano {
  paginas: number;
  texto: string;
}

export async function leerPlano(rutaAbsoluta: string): Promise<PlanoLeido> {
  const datos = new Uint8Array(await readFile(rutaAbsoluta));
  const tarea = getDocument({ data: datos, verbosity: 0 });
  const doc = await tarea.promise;
  try {
    let pagina1: TextoPdf[] = [];
    const textos: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const contenido = await pagina.getTextContent();
      const items = contenido.items
        .filter((i): i is typeof i & { str: string; transform: number[] } => "str" in i)
        .filter((i) => i.str.trim())
        // Postgres rechaza el carácter nulo en columnas de texto.
        .map((i) => ({
          texto: i.str.replace(/\u0000/g, "").trim(),
          x: i.transform[4],
          y: i.transform[5],
        }))
        .filter((i) => i.texto);
      if (n === 1) pagina1 = items;
      textos.push(items.map((i) => i.texto).join(" "));
      pagina.cleanup();
    }
    const texto = textos.join("\n");
    return {
      ...extraerEspecificaciones(pagina1, texto),
      paginas: doc.numPages,
      texto: texto.slice(0, MAX_TEXTO),
    };
  } finally {
    await tarea.destroy();
  }
}
