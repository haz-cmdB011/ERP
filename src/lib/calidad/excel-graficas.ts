// Gráficas nativas de Excel (editables, con sus datos en la hoja) para un libro que ya armó exceljs.
//
// exceljs no sabe crear gráficas, pero un .xlsx es un zip: aquí se le agregan a mano las piezas
// (dibujo, gráfica, relaciones y tipos de contenido) de cada gráfica, apuntando a celdas de la hoja
// (por eso, si se cambian los números, la gráfica se actualiza). Cada gráfica lleva también una
// copia de los datos (caché) para que se vea en visores que no recalculan.

import JSZip from "jszip";

export interface SerieGrafica {
  nombre: string;
  // Celda con el nombre de la serie y rango de sus valores, p. ej. "'Por tipo'!$D$1" y "'Por tipo'!$D$2:$D$5".
  refNombre: string;
  refValores: string;
  valores: number[];
  // Color "RRGGBB". En un pastel se usa el color de cada rebanada (`colores`).
  color: string;
  colores?: string[];
}

export interface GraficaExcel {
  // Hoja donde se coloca la gráfica.
  hoja: string;
  titulo: string;
  tipo: "barras" | "columnas" | "pastel";
  // Barras o columnas apiladas (una serie encima de la otra) en vez de lado a lado.
  apilado?: boolean;
  refCategorias: string;
  categorias: string[];
  series: SerieGrafica[];
  // Dónde se ancla: columna y fila de la esquina (0 = A / 1) y tamaño en columnas y filas.
  ancla: { col: number; fila: number; ancho: number; alto: number };
}

const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function letraColumna(n: number): string {
  // 1 → A, 27 → AA
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

// "'Por tipo'!$A$2:$A$5": el nombre de la hoja entre comillas simples (las comillas se duplican).
export function refRango(hoja: string, columna: number, desdeFila: number, hastaFila: number): string {
  const l = letraColumna(columna);
  const nombre = `'${hoja.replace(/'/g, "''")}'`;
  return desdeFila === hastaFila ? `${nombre}!$${l}$${desdeFila}` : `${nombre}!$${l}$${desdeFila}:$${l}$${hastaFila}`;
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cacheTexto(valores: string[]): string {
  return `<c:strCache><c:ptCount val="${valores.length}"/>${valores
    .map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`)
    .join("")}</c:strCache>`;
}

function cacheNumeros(valores: number[]): string {
  return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${valores.length}"/>${valores
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join("")}</c:numCache>`;
}

const relleno = (color: string) => `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`;

// Etiquetas con el valor; los ceros no se escriben (0;;) para no ensuciar las barras apiladas.
const ETIQUETAS_VALOR =
  '<c:dLbls><c:numFmt formatCode="0;;" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>';
// En el pastel solo el porcentaje (con valor y porcentaje juntos, el formato del valor también
// se aplicaba al porcentaje y salía "10, 1"); lo que vale cero no se rotula.
const ETIQUETAS_PASTEL =
  '<c:dLbls><c:numFmt formatCode="0%;;" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>';

function xmlSerie(g: GraficaExcel, s: SerieGrafica, i: number): string {
  // El nombre de la serie sale de una celda; sin celda (el pastel del resumen) va escrito en la gráfica.
  const tx = s.refNombre
    ? `<c:tx><c:strRef><c:f>${esc(s.refNombre)}</c:f>${cacheTexto([s.nombre])}</c:strRef></c:tx>`
    : `<c:tx><c:v>${esc(s.nombre)}</c:v></c:tx>`;
  const cat = `<c:cat><c:strRef><c:f>${esc(g.refCategorias)}</c:f>${cacheTexto(g.categorias)}</c:strRef></c:cat>`;
  const val = `<c:val><c:numRef><c:f>${esc(s.refValores)}</c:f>${cacheNumeros(s.valores)}</c:numRef></c:val>`;
  if (g.tipo === "pastel") {
    const rebanadas = (s.colores ?? [])
      .map((c, n) => `<c:dPt><c:idx val="${n}"/><c:bubble3D val="0"/><c:spPr>${relleno(c)}</c:spPr></c:dPt>`)
      .join("");
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${rebanadas}${ETIQUETAS_PASTEL}${cat}${val}</c:ser>`;
  }
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}<c:spPr>${relleno(s.color)}</c:spPr><c:invertIfNegative val="0"/>${ETIQUETAS_VALOR}${cat}${val}</c:ser>`;
}

// El valor más alto que alcanza una barra (apiladas: la suma de sus partes).
function valorMaximo(g: GraficaExcel): number {
  const cantidad = Math.max(0, ...g.series.map((s) => s.valores.length));
  let maximo = 0;
  for (let i = 0; i < cantidad; i++) {
    const valores = g.series.map((s) => s.valores[i] ?? 0);
    maximo = Math.max(maximo, g.apilado ? valores.reduce((a, b) => a + b, 0) : Math.max(...valores));
  }
  return maximo;
}

function xmlGrafica(g: GraficaExcel, n: number): string {
  // Con pocas unidades Excel pone marcas cada 0.5 y, al redondearlas a enteros, salen repetidas
  // (0, 1, 2, 2, 3, 3…): se fija el paso en 1.
  const paso = valorMaximo(g) <= 8 ? '<c:majorUnit val="1"/>' : "";
  const idCat = 50010 + n * 2;
  const idVal = idCat + 1;
  const series = g.series.map((s, i) => xmlSerie(g, s, i)).join("");
  const horizontal = g.tipo === "barras";

  let trazado: string;
  if (g.tipo === "pastel") {
    trazado = `<c:pieChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/></c:pieChart>`;
  } else {
    const agrupacion = g.apilado ? "stacked" : "clustered";
    const ejes =
      // En barras horizontales la primera categoría va arriba (eje al revés) y el eje de valores abajo.
      `<c:catAx><c:axId val="${idCat}"/><c:scaling><c:orientation val="${horizontal ? "maxMin" : "minMax"}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "l" : "b"}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${idVal}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
      `<c:valAx><c:axId val="${idVal}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "b" : "l"}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${idCat}"/><c:crosses val="${horizontal ? "max" : "autoZero"}"/><c:crossBetween val="between"/>${paso}</c:valAx>`;
    trazado = `<c:barChart><c:barDir val="${horizontal ? "bar" : "col"}"/><c:grouping val="${agrupacion}"/><c:varyColors val="0"/>${series}<c:gapWidth val="60"/>${g.apilado ? '<c:overlap val="100"/>' : ""}<c:axId val="${idCat}"/><c:axId val="${idVal}"/></c:barChart>${ejes}`;
  }

  const titulo = `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="es-MX" sz="1200" b="1"/><a:t>${esc(g.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
  const leyenda = g.series.length > 1 || g.tipo === "pastel" ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/>` +
    `<c:chart>${titulo}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${trazado}</c:plotArea>${leyenda}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr>` +
    `</c:chartSpace>`
  );
}

function xmlDibujo(graficas: GraficaExcel[]): string {
  const anclas = graficas
    .map((g, i) => {
      const { col, fila, ancho, alto } = g.ancla;
      return (
        `<xdr:twoCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fila}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>${col + ancho}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fila + alto}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${esc(`Gráfica ${i + 1}`)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
        `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
      );
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">${anclas}</xdr:wsDr>`;
}

function desescapar(t: string): string {
  return t.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Ruta (dentro del zip) de la hoja con ese nombre, a partir de workbook.xml y sus relaciones.
async function rutasDeHojas(zip: JSZip): Promise<Map<string, string>> {
  const libro = await zip.file("xl/workbook.xml")!.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const destinoPorId = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const destino = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && destino) destinoPorId.set(id, destino);
  }
  const hojas = new Map<string, string>();
  for (const m of libro.matchAll(/<sheet\b[^>]*>/g)) {
    const nombre = /\bname="([^"]*)"/.exec(m[0])?.[1];
    const id = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    const destino = id ? destinoPorId.get(id) : undefined;
    if (nombre && destino) hojas.set(desescapar(nombre), destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`);
  }
  return hojas;
}

// Agrega las gráficas al .xlsx y devuelve el archivo nuevo. Sin gráficas devuelve el mismo.
export async function agregarGraficas(xlsx: Buffer, graficas: GraficaExcel[]): Promise<Buffer> {
  if (graficas.length === 0) return xlsx;
  const zip = await JSZip.loadAsync(xlsx);
  const rutaDeHoja = await rutasDeHojas(zip);

  const porHoja = new Map<string, GraficaExcel[]>();
  for (const g of graficas) porHoja.set(g.hoja, [...(porHoja.get(g.hoja) ?? []), g]);

  let numGrafica = 0;
  let numDibujo = 0;
  const tipos: string[] = [];

  for (const [hoja, lista] of porHoja) {
    const rutaHoja = rutaDeHoja.get(hoja);
    if (!rutaHoja || !zip.file(rutaHoja)) throw new Error(`No encuentro la hoja "${hoja}" para ponerle sus gráficas.`);
    numDibujo += 1;

    // Las gráficas de esta hoja y su dibujo.
    const relsDibujo: string[] = [];
    lista.forEach((g, i) => {
      numGrafica += 1;
      zip.file(`xl/charts/chart${numGrafica}.xml`, xmlGrafica(g, numGrafica));
      tipos.push(
        `<Override PartName="/xl/charts/chart${numGrafica}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
      );
      relsDibujo.push(`<Relationship Id="rId${i + 1}" Type="${REL}/chart" Target="../charts/chart${numGrafica}.xml"/>`);
    });
    zip.file(`xl/drawings/drawing${numDibujo}.xml`, xmlDibujo(lista));
    zip.file(
      `xl/drawings/_rels/drawing${numDibujo}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsDibujo.join("")}</Relationships>`
    );
    tipos.push(
      `<Override PartName="/xl/drawings/drawing${numDibujo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
    );

    // La hoja apunta a su dibujo: relación en sus .rels y elemento <drawing> al final de la hoja.
    const archivoHoja = rutaHoja.split("/").pop()!;
    const rutaRels = `xl/worksheets/_rels/${archivoHoja}.rels`;
    const relDibujo = `<Relationship Id="rIdGraficas" Type="${REL}/drawing" Target="../drawings/drawing${numDibujo}.xml"/>`;
    const relsExistentes = zip.file(rutaRels);
    if (relsExistentes) {
      const xml = await relsExistentes.async("string");
      zip.file(rutaRels, xml.replace("</Relationships>", `${relDibujo}</Relationships>`));
    } else {
      zip.file(
        rutaRels,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relDibujo}</Relationships>`
      );
    }
    const xmlHoja = await zip.file(rutaHoja)!.async("string");
    if (xmlHoja.includes("<drawing ")) throw new Error(`La hoja "${hoja}" ya tiene un dibujo.`);
    zip.file(rutaHoja, xmlHoja.replace("</worksheet>", '<drawing r:id="rIdGraficas"/></worksheet>'));
  }

  const rutaTipos = "[Content_Types].xml";
  const tiposXml = await zip.file(rutaTipos)!.async("string");
  zip.file(rutaTipos, tiposXml.replace("</Types>", `${tipos.join("")}</Types>`));

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
