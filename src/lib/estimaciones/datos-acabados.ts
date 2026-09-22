// Catálogos y parámetros del motor de precio de maquila de Acabados.
//
// Mientras la migración del módulo no esté aplicada, estos valores viven aquí
// para que la pantalla de captura funcione completa (mismas tarifas, mismos
// escalones y el mismo histórico que se usó para calibrarlas). Cuando existan
// las tablas `tarifas_familia`, `factores` y `renglones`, este archivo se
// reduce a los tipos y todo lo demás se lee de la base.

export interface RenglonHistorico {
  modelo: string;
  familia: string;
  acabado: string;
  acabado2: string;
  cantidad: number;
  propuesto: number;
  aceptado: number;
  fecha: string;
  folio: string;
  obra: string;
  ot: string;
}

// [modelo, familia, acabado, acabado2, cantidad, propuesto, aceptado, fecha, folio, obra, ot]
type FilaHistorica = [string, string, string, string, number, number, number, string, string, string, string];

const FILAS: FilaHistorica[] = [
  ["CUELA ROSA MORADO","Moldura / duela","Barniz Mate","",83,10,10,"2025-12-08","1892","REMODELACIÓN CAMPESTRE","102-24"],
  ["DUELA ROSA MORADO","Moldura / duela","Barniz Mate","",29,10,10,"2025-12-08","1892","REMODELACIÓN CAMPESTRE","102-24"],
  ["MOLDURA DE PEDESTAL DE MESA","Moldura / duela","Laca Brillante","",2,300,100,"2025-12-26","1907","REMODELACIÓN CAMPESTRE","102-24"],
  ["DES01","Puerta","Laca Especial (Cencerro/Gypso)","Laca Especial (Cencerro/Gypso)",1,700,700,"2025-10-20","1863","AZOTEA - PH MONTERREY","193-24-2 SDC17"],
  ["DEC-13","Marco (lavabo / decorativo)","Laca Metálica / Aluminio","",2,120,120,"2025-10-06","1848","PLANTA BAJA - PH MONTERREY","193-24-2 SDC12"],
  ["MOLDURA PRECHAPEADA","Moldura / duela","Laca Mate","",4,60,60,"2025-06-30","1769","PH MONTERREY","193-24"],
  ["MOLDURA PRECHAPEADA ENCINO","Moldura / duela","Laca Mate","",6,60,60,"2025-06-30","1769","PH MONTERREY","193-24"],
  ["MOLDURA ENCINO","Moldura / duela","Laca Mate","",4,60,60,"2025-06-30","1769","PH MONTERREY","193-24"],
  ["MOLDURA PRECHAPEADA","Moldura / duela","Laca Mate","",8,80,80,"2025-06-30","1770","PH MONTERREY","193-24"],
  ["FX-05","Moldura / duela","Laca Mate","",1,50,50,"2025-06-30","1770","PH MONTERREY","193-24"],
  ["FX-05","Panel / mampara","Pintura Directa / Sólido","",2,350,250,"2025-06-30","1770","PH MONTERREY","193-24"],
  ["FX-06","Marco (lavabo / decorativo)","Laca Semimate","",1,1200,1000,"2025-07-28","1786","PLANTA BAJA - PH MONTERREY","193-24"],
  ["FX-06","Moldura / duela","Laca Semimate","",1,500,250,"2025-07-28","1786","PLANTA BAJA - PH MONTERREY","193-24"],
  ["FX-09","Marco (lavabo / decorativo)","Laca Semimate","",1,1200,1000,"2025-07-28","1786","PLANTA BAJA - PH MONTERREY","193-24"],
  ["FX-09","Moldura / duela","Laca Semimate","",1,500,250,"2025-07-28","1786","PLANTA BAJA - PH MONTERREY","193-24"],
  ["DEC-07/DEC-09","Lambrín","Laca Semimate","",1,1800,1500,"2025-07-28","1786","PLANTA BAJA - PH MONTERREY","193-24"],
  ["DEC-19/DEC-19/DEC-07","Lambrín","Laca Mate","",1,800,500,"2025-08-11","1803","PLANTA BAJA - PH MONTERREY","193-24-2 SDC12"],
  ["DEC-17","Lambrín","Laca Mate","",1,3500,2600,"2025-08-25","1812","PLANTA BAJA - PH MONTERREY","193-24-2 SDC12"],
  ["FX-02","Marco (lavabo / decorativo)","Laca Mate","",1,1500,850,"2025-08-25","1812","PLANTA BAJA - PH MONTERREY","193-24-2 SDC12"],
  ["P-7/P-8","Puerta","Laca Mate","",7,400,250,"2025-09-15","1832","PLANTA BAJA - PH MONTERREY","193-24-2 SDC12"],
  ["FIJO CUERPO","Otro","Laca Mate","",7,150,60,"2025-09-15","1832","PLANTA BAJA - PH MONTERREY","193-24-2 SDC12"],
  ["DEC-07/DEC-09","Lambrín","Laca Semimate","",1,1800,1200,"2025-08-04","1797","PLANTA BAJA - PH MONTERREY","193-24"],
  ["ZOCLO","Zoclo","Laca Brillante","",4,20,20,"2025-06-23","1765","ESCALERA PB MEZANINE LIVERPOOL CENTRO","146-24"],
  ["ENTRPAÑO-GRAPA","Entrepaño","Laca Brillante","",90,70,50,"2025-08-25","1814","POS LIVERPOOL ETAPA 6 TOREO","007-25"],
  ["P-7105","Góndola / exhibidor","Laca Brillante","",1,650,650,"2025-04-07","1713","BEAUTY FAV VARIAS UBICACIONES","008-25"],
  ["L-7230","Góndola / exhibidor","Laca Brillante","",1,250,250,"2025-04-07","1705","BEAUTY FAV VARIAS UBICACIONES","008-25"],
  ["ZOCLO","Zoclo","Laca Especial (Cencerro/Gypso)","",4,20,20,"2025-03-14","1698","BEAUTY FAV VARIAS UBICACIONES","008-25"],
  ["ZOCLO","Zoclo","Laca Especial (Cencerro/Gypso)","",3,20,20,"2025-03-14","1698","BEAUTY FAV VARIAS UBICACIONES","008-25"],
  ["ZOCLO","Zoclo","Laca Especial (Cencerro/Gypso)","",6,20,20,"2025-03-14","1698","BEAUTY FAV VARIAS UBICACIONES","008-25"],
  ["L-7216-01","Góndola / exhibidor","Laca Brillante","Laca Brillante",1,1300,1300,"2025-03-14","1697","BEAUTY FAV VARIAS UBICACIONES","008-25"],
  ["L-7213","Mesa completa","Laca Mate","",3,350,350,"2025-03-14","1697","BEAUTY FAV VARIAS UBICACIONES","008-25"],
  ["L-7212","Mesa completa","Laca Brillante","",3,350,350,"2025-03-14","1697","BEAUTY FAV VARIAS UBICACIONES","008-25"],
  ["P-7104C-01","Góndola / exhibidor","Laca Brillante","Laca Brillante",3,650,350,"2025-03-10","1692","BEAUTY FAV VARIAS UBICACIONES","008-25"],
  ["P-7104B-01","Góndola / exhibidor","Laca Brillante","Laca Brillante",2,400,350,"2025-03-10","1692","BEAUTY FAV VARIAS UBICACIONES","008-25"],
  ["ZOCLO","Zoclo","Laca Mate","",16,20,20,"2025-04-28","1723","BOLSAS LIV. ORIZABA","010-25"],
  ["L-1205","Mesa completa","Sin acabado","",7,150,120,"2025-03-10","1690","BOLSAS LIV. ORIZABA","010-25"],
  ["L-1214","Mesa completa","Sin acabado","",3,100,80,"2025-03-10","1690","BOLSAS LIV. ORIZABA","010-25"],
  ["CW-11","Silla / banca / taburete","Laca Mate","",1,600,400,"2025-02-10","1677","BANCAS PASEO SAN PEDRO MTY","011-25"],
  ["CW-11","Silla / banca / taburete","Laca Mate","",1,600,400,"2025-02-10","1677","BANCAS PASEO SAN PEDRO MTY","011-25"],
  ["M-103C","Mesa completa","Pintura Directa / Sólido","",1,1200,1000,"2025-02-10","1678","MESA M-103 LIV. TEZONTLE","014-25"],
  ["ZOCLO","Zoclo","Laca Especial (Cencerro/Gypso)","",23,20,20,"2025-05-05","1729","ATELIER NC LIV. PERISUR","016-25"],
  ["L-3251","Góndola / exhibidor","Pintura Directa / Sólido","",7,300,200,"2025-03-24","1706","PANTYTABLE LIV. VARIAS UBICACIONES","019-25"],
  ["L-3251","Góndola / exhibidor","Pintura Directa / Sólido","",6,300,200,"2025-03-14","1699","PANTYTABLE LIV. VARIAS UBICACIONES","019-25"],
  ["ENTREPAÑO","Entrepaño","Pintura Directa / Sólido","",56,30,30,"2025-03-14","1699","PANTYTABLE LIV. VARIAS UBICACIONES","019-25"],
  ["ENTREPAÑO","Entrepaño","Pintura Directa / Sólido","",42,30,30,"2025-03-14","1699","PANTYTABLE LIV. VARIAS UBICACIONES","019-25"],
  ["P-4162","Góndola / exhibidor","Laca Mate","",1,2800,2800,"2025-03-31","1710","PERIMETROS LIV. LEON ETAPA 3","020-25"],
  ["P-4148B-04","Góndola / exhibidor","Laca Mate","Laca Especial (Cencerro/Gypso)",1,1000,850,"2025-03-24","1707","PERIMETROS LIV. LEON ETAPA 3","020-25"],
  ["ACC-274 CAJA 4","Repisa","Pintura Directa / Sólido","",2,650,450,"2025-03-24","1707","PERIMETROS LIV. LEON ETAPA 3","020-25"],
  ["P-3103A","Otro","Laca Mate","",2,600,450,"2025-03-14","1700","PERIMETROS LIV. LEON ETAPA 3","020-25"],
  ["P-1066","Panel / mampara","Laca Brillante","",2,400,300,"2025-03-10","1696","PERIMETROS LIV. LEON ETAPA 3","020-25"],
  ["ZOCLO","Zoclo","Laca Especial (Cencerro/Gypso)","",25,20,20,"2025-03-14","1701","ZAPATOS CABALLERO LIV. TEPIC","025-25"],
  ["G-G001CA","Góndola / exhibidor","Laca Mate","",1,250,250,"2025-06-30","1773","MUEBLES SOBRANTES SB","033-25"],
  ["G-G001CA","Góndola / exhibidor","Laca Mate","",4,250,180,"2025-06-23","1760","MUEBLES SOBRANTES SB","033-25"],
  ["P-P001","Entrepaño","Laca Mate","",3,120,120,"2025-06-09","1747","MUEBLES SOBRANTES SB","033-25"],
  ["F-G-001","Góndola / exhibidor","Laca Mate","",1,250,250,"2025-06-09","1747","MUEBLES SOBRANTES SB","033-25"],
  ["G-G001CA","Góndola / exhibidor","Laca Mate","",2,250,190,"2025-06-09","1747","MUEBLES SOBRANTES SB","033-25"],
  ["H-C-001","Otro","Laca Semimate","",1,700,500,"2025-05-12","1735","MUEBLES SOBRANTES SB","033-25"],
  ["ZOCLO","Zoclo","Laca Especial (Cencerro/Gypso)","",6,20,20,"2025-06-23","1762","HOMBRE CONTEMPORANEO LIV. PERISUR","037-25"],
  ["ZOCLO","Zoclo","Laca Especial (Cencerro/Gypso)","",3,20,20,"2025-06-23","1761","HOMBRE CONTEMPORANEO LIV. PERISUR","037-25"],
  ["GID-539","Otro","Laca Brillante","",1,200,100,"2025-04-28","1721","HOMBRE CONTEMPORANEO LIV. INSURGENTES","040-25"],
  ["GID-537","Otro","Laca Brillante","",1,200,100,"2025-04-28","1721","HOMBRE CONTEMPORANEO LIV. INSURGENTES","040-25"],
  ["GID-535","Otro","Laca Brillante","",1,200,100,"2025-04-28","1721","HOMBRE CONTEMPORANEO LIV. INSURGENTES","040-25"],
  ["GID-535","Otro","Laca Brillante","",1,200,100,"2025-04-28","1721","HOMBRE CONTEMPORANEO LIV. INSURGENTES","040-25"],
  ["FAC-01","Marco (lavabo / decorativo)","Laca Brillante","",2,25,25,"2025-06-02","1746","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["FAC-01","Marco (lavabo / decorativo)","Laca Brillante","",2,25,25,"2025-06-02","1746","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["FAC-01","Cerco / engrosador","Laca Brillante","",2,25,25,"2025-06-02","1746","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["FAC-01","Cerco / engrosador","Laca Brillante","",2,25,25,"2025-06-02","1746","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["MIR-1","Otro","Pintura Directa / Sólido","",4,100,100,"2025-05-19","1738","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["ENTREPAÑO","Entrepaño","Laca Mate","",2,150,150,"2025-05-19","1738","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["BC-1","Entrepaño","Laca Metálica / Aluminio","",1,150,150,"2025-05-19","1738","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["TRANS-01","Marco (lavabo / decorativo)","Laca Mate","",4,450,450,"2025-05-19","1737","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["P-1","Puerta","Laca Mate","",1,800,700,"2025-05-19","1737","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["ZOCLO","Zoclo","Laca Brillante","",50,20,20,"2025-05-12","1734","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["BC-1","Entrepaño","Laca Brillante","",6,150,100,"2025-05-12","1734","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["TABLE TOP SIGN 7X7","Cubierta / table top","Laca Mate","",15,50,50,"2025-05-12","1733","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["TABLE TOP SIGN 11X11","Cubierta / table top","Laca Mate","",15,80,50,"2025-05-12","1733","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["TABLE TOP SIGN BLACK 7X7","Cubierta / table top","Laca Mate","",15,50,50,"2025-05-12","1733","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["ZOCLO","Zoclo","Laca Especial (Cencerro/Gypso)","",9,20,20,"2025-06-23","1763","MOBILIARIO FABLETICS GALERIA METEPEC","045-25"],
  ["ZOCLO","Zoclo","Laca Especial (Cencerro/Gypso)","",3,20,20,"2025-05-05","1730","MOBILIARIO FABLETICS GALERIA METEPEC","047-25"],
  ["IN-005","Cubo / aro decorativo","Sin acabado","",1,120,120,"2025-08-18","1811","INDOOR WINDOW FT LIV. SANTA FE","053-25"],
  ["IN-005","Cubo / aro decorativo","Sin acabado","",1,180,180,"2025-08-18","1811","INDOOR WINDOW FT LIV. SANTA FE","053-25"],
  ["IN-005","Cubo / aro decorativo","Sin acabado","",1,210,210,"2025-08-18","1811","INDOOR WINDOW FT LIV. SANTA FE","053-25"],
  ["IN-005","Cubo / aro decorativo","Laca Semimate","",1,150,120,"2025-05-12","1736","INDOOR WINDOW FT LIV. SANTA FE","053-25"],
  ["IN-005","Cubo / aro decorativo","Laca Semimate","Laca Semimate",1,250,180,"2025-05-12","1736","INDOOR WINDOW FT LIV. SANTA FE","053-25"],
  ["IN-005","Cubo / aro decorativo","Laca Semimate","",1,400,210,"2025-05-12","1736","INDOOR WINDOW FT LIV. SANTA FE","053-25"],
  ["IN-005","Entrepaño","Sin acabado","",3,250,200,"2025-05-12","1736","INDOOR WINDOW FT LIV. SANTA FE","053-25"],
  ["IN-005","Entrepaño","Sin acabado","",1,350,200,"2025-05-12","1736","INDOOR WINDOW FT LIV. SANTA FE","053-25"],
];

export const HISTORICO: RenglonHistorico[] = FILAS.map((r) => ({
  modelo: r[0],
  familia: r[1],
  acabado: r[2],
  acabado2: r[3],
  cantidad: r[4],
  propuesto: r[5],
  aceptado: r[6],
  fecha: r[7],
  folio: r[8],
  obra: r[9],
  ot: r[10],
}));

export const FAMILIAS = [
  "Zoclo",
  "Moldura / duela",
  "Entrepaño",
  "Puerta",
  "Marco (lavabo / decorativo)",
  "Cerco / engrosador",
  "Lambrín",
  "Cubierta / table top",
  "Mesa completa",
  "Silla / banca / taburete",
  "Repisa",
  "Barra",
  "Góndola / exhibidor",
  "Cubo / aro decorativo",
  "Pieza decorativa (DEC / CAN)",
  "Panel / mampara",
  "Otro",
];

export const ACABADOS = [
  "Laca Mate",
  "Laca Semimate",
  "Laca Brillante",
  "Laca Especial (Cencerro/Gypso)",
  "Laca Metálica / Aluminio",
  "Barniz Mate",
  "Barniz Semimate",
  "Barniz Brillante",
  "Poliuretano Mate",
  "Tinta / Barniz Especial",
  "Pintura Directa / Sólido",
  "Sin acabado",
];

// Auditoría, no precio: qué le hicieron a la pieza. No entra al motor.
export const FASES = [
  "Limpieza",
  "Resanado",
  "Lijado",
  "Rectificado",
  "Sellado",
  "Premiado",
  "Asentado",
  "Pintado",
];

export const CAUSAS_REPROCESO = [
  "Daño del maquilador",
  "Cambio de diseño",
  "Daño en traslado",
  "Falla de material",
  "Rechazo de calidad",
  "Otra área",
  "Sin determinar",
];

// Familias que no se negocian: el precio es el mismo sin importar el volumen.
export const TARIFAS_FIJAS: Record<string, number> = {
  Zoclo: 20,
  "Cerco / engrosador": 25,
  "Cubierta / table top": 50,
};

// Tarifa base por familia (nivel 3). Sin calibrar todavía: corre en sombra.
export const TARIFAS_BASE: Record<string, number> = {
  "Moldura / duela": 60,
  Entrepaño: 120,
  "Cubo / aro decorativo": 180,
  "Góndola / exhibidor": 250,
  "Panel / mampara": 275,
  "Mesa completa": 350,
  "Silla / banca / taburete": 400,
  "Marco (lavabo / decorativo)": 450,
  Repisa: 450,
  Puerta: 700,
  Lambrín: 1350,
};

export const VOLUMEN = [
  { clave: "1 pieza", min: 1, max: 1 as number | null, valor: 1.0 },
  { clave: "2 a 3", min: 2, max: 3 as number | null, valor: 0.8 },
  { clave: "4 a 10", min: 4, max: 10 as number | null, valor: 0.7 },
  { clave: "más de 10", min: 11, max: null as number | null, valor: 0.5 },
];

export const PRIORIDAD: Record<string, number> = {
  normal: 1.0,
  preferente: 1.15,
  urgente: 1.3,
};

export interface EntradaCatalogo {
  modelo: string;
  familia: string;
}

// Par modelo + familia, como la llave del catálogo en la base: el mismo
// código de modelo puede llegar como dos familias distintas (FAC-01 es
// Marco y también Cerco).
export const CATALOGO: EntradaCatalogo[] = (() => {
  const vistos = new Set<string>();
  const out: EntradaCatalogo[] = [];
  for (const h of HISTORICO) {
    const modelo = h.modelo.trim().toUpperCase().replace(/\s+/g, " ");
    const clave = `${modelo}|${h.familia}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ modelo, familia: h.familia });
  }
  return out;
})();

export const MODELOS = Array.from(new Set(CATALOGO.map((c) => c.modelo))).sort();
export const OBRAS = Array.from(new Set(HISTORICO.map((h) => h.obra))).sort();
export const OTS = Array.from(new Set(HISTORICO.map((h) => h.ot))).sort();
