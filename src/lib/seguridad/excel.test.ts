import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  MAX_BYTES_DESCOMPRIMIDOS_EXCEL,
  MAX_BYTES_ENTRADA_EXCEL,
  validarContenidoExcel,
} from "./excel";

async function zipDe(archivos: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [nombre, contenido] of Object.entries(archivos)) zip.file(nombre, contenido);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

const LIBRO_MINIMO = { "[Content_Types].xml": "<Types/>", "xl/workbook.xml": "<workbook/>" };

// Cambia el tamaño descomprimido que declara la primera entrada del directorio central.
function declararTamano(zip: Buffer, bytes: number): Buffer {
  const copia = Buffer.from(zip);
  const i = copia.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  copia.writeUInt32LE(bytes, i + 24);
  return copia;
}

describe("validarContenidoExcel", () => {
  it("acepta un libro real generado por exceljs", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("PEDIDO").addRow(["a", "b"]);
    expect(validarContenidoExcel(Buffer.from(await wb.xlsx.writeBuffer()))).toEqual({ ok: true });
  });

  it("acepta un libro con las partes mínimas", async () => {
    expect(validarContenidoExcel(await zipDe(LIBRO_MINIMO))).toEqual({ ok: true });
  });

  it("rechaza lo que no es un ZIP aunque se llame .xlsx", () => {
    for (const falso of [
      Buffer.from("esto es texto plano que finge ser un excel"),
      Buffer.from("%PDF-1.7 ................................"),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      Buffer.alloc(0),
    ]) {
      expect(validarContenidoExcel(falso).ok).toBe(false);
    }
  });

  it("rechaza el formato .xls antiguo (OLE2)", () => {
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
    expect(validarContenidoExcel(ole).ok).toBe(false);
  });

  it("rechaza un ZIP que no es un libro de Excel (p. ej. un .docx)", async () => {
    const docx = await zipDe({ "[Content_Types].xml": "<Types/>", "word/document.xml": "<w:document/>" });
    expect(validarContenidoExcel(docx).ok).toBe(false);
  });

  it("rechaza un ZIP truncado", async () => {
    const zip = await zipDe(LIBRO_MINIMO);
    expect(validarContenidoExcel(zip.subarray(0, zip.length - 10)).ok).toBe(false);
  });

  it("rechaza una bomba zip: una parte que se descomprime a más del tope", async () => {
    const zip = declararTamano(await zipDe(LIBRO_MINIMO), MAX_BYTES_ENTRADA_EXCEL + 1);
    const r = validarContenidoExcel(zip);
    expect(r.ok).toBe(false);
  });

  it("rechaza muchas partes que juntas pasan el tope total", async () => {
    const porParte = MAX_BYTES_ENTRADA_EXCEL;
    const partes = Math.ceil(MAX_BYTES_DESCOMPRIMIDOS_EXCEL / porParte) + 1;
    const archivos: Record<string, string> = { ...LIBRO_MINIMO };
    for (let i = 0; i < partes; i++) archivos[`xl/media/img${i}.png`] = "x";
    let zip = await zipDe(archivos);
    // Se declara a todas las partes el tamaño máximo permitido por parte.
    zip = Buffer.from(zip);
    const firma = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    for (let i = zip.indexOf(firma); i >= 0; i = zip.indexOf(firma, i + 4)) zip.writeUInt32LE(porParte, i + 24);
    expect(validarContenidoExcel(zip).ok).toBe(false);
  });

  it("rechaza el valor reservado de ZIP64 en el tamaño de una parte", async () => {
    expect(validarContenidoExcel(declararTamano(await zipDe(LIBRO_MINIMO), 0xffffffff)).ok).toBe(false);
  });
});
