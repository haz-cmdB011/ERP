// Lógica sin base del respaldo de datos (`npm run db:respaldo`, scripts/db/respaldo.mts).
//
// El respaldo lee con la clave de servicio, por la API de Supabase, sin pg_dump ni la CLI. De la
// descripción de la API (OpenAPI de PostgREST) sale qué respaldar: las TABLAS (las rutas que aceptan
// alta; las vistas solo se leen y salen de las tablas, así que no se respaldan) y su llave primaria,
// que da el orden estable para leerlas por páginas sin perder ni repetir filas.

export type TablaRespaldo = { tabla: string; orden: string[] };

type EspecificacionApi = {
  paths?: Record<string, Record<string, unknown>>;
  definitions?: Record<string, { properties?: Record<string, { description?: string }> }>;
};

// PostgREST marca la llave primaria en la descripción de la columna con "<pk/>".
const MARCA_LLAVE = "<pk/>";

/** Tablas de la API (no vistas ni funciones) con las columnas de su llave primaria, por nombre. */
export function tablasDeEspecificacion(especificacion: EspecificacionApi): TablaRespaldo[] {
  const rutas = especificacion.paths ?? {};
  const definiciones = especificacion.definitions ?? {};
  return Object.keys(rutas)
    .filter((ruta) => ruta !== "/" && !ruta.startsWith("/rpc/") && rutas[ruta]?.post !== undefined)
    .map((ruta) => {
      const tabla = ruta.slice(1);
      const columnas = definiciones[tabla]?.properties ?? {};
      const orden = Object.entries(columnas)
        .filter(([, columna]) => (columna.description ?? "").includes(MARCA_LLAVE))
        .map(([nombre]) => nombre);
      return { tabla, orden };
    })
    .sort((a, b) => a.tabla.localeCompare(b.tabla));
}

/** Carpeta del respaldo: "2026-11-27_0930" en hora de México, para ordenar por nombre. */
export function nombreCarpetaRespaldo(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return `${parte("year")}-${parte("month")}-${parte("day")}_${parte("hour")}${parte("minute")}`;
}

export type ResultadoTabla = { tabla: string; filas: number; esperadas: number | null; error?: string };

/** Tablas cuyo respaldo no está completo: con error o con menos (o más) filas que las que contó la base. */
export function tablasIncompletas(resultados: ResultadoTabla[]): ResultadoTabla[] {
  return resultados.filter((r) => r.error !== undefined || (r.esperadas !== null && r.filas !== r.esperadas));
}
