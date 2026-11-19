// Validación del contenido real de un Excel subido (.xlsx / .xlsm), ANTES de pasarlo a exceljs.
//
// La extensión y el tipo que declara el navegador los controla quien sube el archivo.
// Un .xlsx es un ZIP: aquí se comprueba que de verdad lo sea, que traiga las partes
// mínimas de un libro de Excel y que no sea una "bomba zip" (un archivo chico en
// disco que ocupa gigabytes al descomprimirlo, como el de 40 MB que sí permite el tope
// de la ruta). Se lee solo el directorio central del ZIP: no se descomprime nada.
//
// Límite conocido: los tamaños son los que DECLARA el ZIP. Uno forjado a propósito
// que mienta en su cabecera no se detecta aquí (jszip, que usa exceljs, lo rechaza
// al descomprimir por no coincidir el tamaño, pero después de inflarlo). Por eso la
// ruta que lo usa exige antes el rol de Planeación.

export const MAX_ENTRADAS_EXCEL = 10_000;
// Un libro con muchas imágenes o filas llega a cientos de MB sin comprimir; esto
// deja pasar cualquier pedido real y frena los miles de MB de una bomba.
export const MAX_BYTES_DESCOMPRIMIDOS_EXCEL = 600 * 1024 * 1024;
export const MAX_BYTES_ENTRADA_EXCEL = 250 * 1024 * 1024;
// Lo que pesa de verdad al leerlo es el XML (hojas, textos, estilos), no las imágenes: exceljs lo carga
// entero en memoria, unas 15–20 veces su tamaño. En 589 PM reales de 2024 a 2026 el mayor trae 13 MB de
// XML; un PM con 3 hojas de millones de filas vacías con formato (249 MB) hacía que el lector pidiera más
// de 4 GB y tumbara el servidor, y una sola hoja de 82 MB ya usaba 1.8 GB. Con este tope (4 veces lo más
// grande que hay) un archivo así se rechaza antes de leerlo, con un mensaje que dice cómo arreglarlo.
export const MAX_BYTES_XML_EXCEL = 50 * 1024 * 1024;

const FIRMA_LOCAL = 0x04034b50; // "PK\x03\x04"
const FIRMA_FIN_DIRECTORIO = 0x06054b50;
const FIRMA_DIRECTORIO = 0x02014b50;
const MAXIMO_32 = 0xffffffff;
const MAXIMO_16 = 0xffff;
// El registro del final del ZIP mide 22 bytes más un comentario de hasta 65535.
const VENTANA_FIN_DIRECTORIO = 22 + 65_535;

export type ResultadoExcel = { ok: true } | { ok: false; motivo: string };

const rechazo = (motivo: string): ResultadoExcel => ({ ok: false, motivo });

export function validarContenidoExcel(buffer: Buffer | Uint8Array): ResultadoExcel {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  if (b.length < 22 || b.readUInt32LE(0) !== FIRMA_LOCAL) {
    return rechazo("El archivo no es un libro de Excel (.xlsx o .xlsm) válido.");
  }

  // Registro de fin del directorio central: se busca desde el final hacia atrás.
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - VENTANA_FIN_DIRECTORIO); i--) {
    if (b.readUInt32LE(i) === FIRMA_FIN_DIRECTORIO) {
      fin = i;
      break;
    }
  }
  if (fin < 0) return rechazo("El archivo de Excel está dañado o incompleto.");

  const totalEntradas = b.readUInt16LE(fin + 10);
  const tamanoDirectorio = b.readUInt32LE(fin + 12);
  const inicioDirectorio = b.readUInt32LE(fin + 16);
  // ZIP64 (valores al tope): un Excel de hasta 40 MB no lo necesita.
  if (totalEntradas === MAXIMO_16 || tamanoDirectorio === MAXIMO_32 || inicioDirectorio === MAXIMO_32) {
    return rechazo("El archivo de Excel no es válido (estructura no admitida).");
  }
  if (totalEntradas > MAX_ENTRADAS_EXCEL) {
    return rechazo("El archivo de Excel no es válido (demasiadas partes internas).");
  }
  if (inicioDirectorio + tamanoDirectorio > fin) {
    return rechazo("El archivo de Excel está dañado o incompleto.");
  }

  const nombres = new Set<string>();
  let total = 0;
  let xml = 0;
  let pos = inicioDirectorio;
  for (let n = 0; n < totalEntradas; n++) {
    if (pos + 46 > b.length || b.readUInt32LE(pos) !== FIRMA_DIRECTORIO) {
      return rechazo("El archivo de Excel está dañado o incompleto.");
    }
    const tamanoDescomprimido = b.readUInt32LE(pos + 24);
    const largoNombre = b.readUInt16LE(pos + 28);
    const largoExtra = b.readUInt16LE(pos + 30);
    const largoComentario = b.readUInt16LE(pos + 32);
    if (pos + 46 + largoNombre > b.length) return rechazo("El archivo de Excel está dañado o incompleto.");

    if (tamanoDescomprimido === MAXIMO_32 || tamanoDescomprimido > MAX_BYTES_ENTRADA_EXCEL) {
      return rechazo("El archivo de Excel contiene una parte demasiado grande al descomprimirse.");
    }
    total += tamanoDescomprimido;
    if (total > MAX_BYTES_DESCOMPRIMIDOS_EXCEL) {
      return rechazo("El archivo de Excel ocupa demasiado al descomprimirse.");
    }

    const nombre = b.toString("latin1", pos + 46, pos + 46 + largoNombre);
    nombres.add(nombre);
    if (/\.(xml|rels)$/i.test(nombre)) xml += tamanoDescomprimido;
    pos += 46 + largoNombre + largoExtra + largoComentario;
  }

  // Se suma todo el XML y se revisa al final para decir el tamaño real (no el de cuando se cruzó el tope).
  if (xml > MAX_BYTES_XML_EXCEL) {
    return rechazo(
      `El Excel trae demasiados datos en sus hojas (${Math.round(xml / 1048576)} MB al abrirlo; lo normal es menos de 15 MB). Suele ser por filas o columnas vacías con formato: ábrelo en Excel, borra las filas y columnas sobrantes (Ctrl+Fin lleva a la última celda usada), guárdalo y vuelve a subirlo.`
    );
  }

  // Partes que todo libro de Excel trae (y que un ZIP cualquiera, un .docx o un
  // .pptx renombrado no tienen).
  if (!nombres.has("[Content_Types].xml") || !nombres.has("xl/workbook.xml")) {
    return rechazo("El archivo no es un libro de Excel (.xlsx o .xlsm) válido.");
  }
  return { ok: true };
}
