// Comprobador de migraciones: genera UNA consulta SQL de solo lectura que, al
// ejecutarla en Supabase (SQL Editor o la herramienta execute_sql), compara el
// repo contra la base y dice, por migración:
//   - si está en el historial (supabase_migrations.schema_migrations);
//   - si existen en la base los objetos que esa migración debe dejar.
//
// Por qué: una migración puede quedar REGISTRADA en el historial sin haberse
// EJECUTADO (pasó con la auditoría de recibos), o aplicarse en la base sin
// archivo en el repo (pasó con renglones_electrificacion_pedido_on_delete). El
// historial solo no basta: hay que comprobar los objetos.
//
// Uso:   npm run db:verificar                       (todas las migraciones)
//        npm run db:verificar -- --desde=20260929   (solo las recientes)
// Imprime el SQL; pégalo y ejecútalo en Supabase.
//
// Cada migración declara sus objetos esperados con comentarios `@verifica` (ver
// supabase/migrations/20260930120000_auditoria_recibos.sql). Tipos:
//   function <esquema.nombre>                 existe la función
//   function-contiene <esquema.nombre> <txt>  su definición contiene el texto
//   sin-function <esquema.nombre>             la función YA NO existe
//   trigger <esquema.tabla.trigger>
//   column <esquema.tabla.columna>
//   table <esquema.tabla>
//   index <esquema.indice>
//   policy <esquema.tabla.politica>
//   constraint <esquema.tabla.constraint>
// Las migraciones sin anotaciones solo se comprueban contra el historial.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "..", "..", "supabase", "migrations");

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

function existe(tipo, nombre, resto) {
  switch (tipo) {
    case "function":
    case "sin-function":
      return `exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname || '.' || p.proname = ${q(nombre)})`;
    case "function-contiene":
      // El CASE evita llamar pg_get_functiondef sobre agregadas (array_agg...),
      // que da error: PostgreSQL no garantiza el orden de los AND del WHERE.
      return `exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where case when p.prokind = 'f' and n.nspname || '.' || p.proname = ${q(nombre)} then position(${q(resto)} in pg_get_functiondef(p.oid)) else 0 end > 0)`;
    case "trigger":
      return `exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname || '.' || c.relname || '.' || t.tgname = ${q(nombre)})`;
    case "column":
      return `exists (select 1 from information_schema.columns where table_schema || '.' || table_name || '.' || column_name = ${q(nombre)})`;
    case "table":
      return `to_regclass(${q(nombre)}) is not null`;
    case "index":
      return `exists (select 1 from pg_indexes where schemaname || '.' || indexname = ${q(nombre)})`;
    case "policy":
      return `exists (select 1 from pg_policies where schemaname || '.' || tablename || '.' || policyname = ${q(nombre)})`;
    case "constraint":
      return `exists (select 1 from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname || '.' || c.relname || '.' || k.conname = ${q(nombre)})`;
    default:
      throw new Error(`Tipo @verifica desconocido: ${tipo}`);
  }
}

// --desde=<prefijo de versión>: revisa solo las migraciones desde esa versión
// (por ejemplo --desde=20260929), para una consulta más corta.
const desde = (process.argv.find((a) => a.startsWith("--desde=")) ?? "").slice("--desde=".length);

const todas = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((archivo) => {
    const m = archivo.match(/^(\d+)_(.+)\.sql$/);
    if (!m) throw new Error(`Nombre de migración no válido: ${archivo}`);
    const texto = readFileSync(join(DIR, archivo), "utf8");
    const objetos = [...texto.matchAll(/^--\s*@verifica\s+(\S+)\s+(\S+)(?:[ \t]+(.+))?$/gm)].map(
      (x) => ({ tipo: x[1], nombre: x[2], resto: (x[3] ?? "").trim().replace(/\r$/, "") })
    );
    return { archivo, version: m[1], nombre: m[2], objetos };
  });

// Una función que una migración posterior borra (`sin-function`) ya no se
// comprueba en las anteriores: lo que dejaron quedó reemplazado. Se calcula con
// todas las migraciones, aunque se pida --desde.
const migraciones = todas
  .map((mig, i) => {
    const borradasDespues = new Set(
      todas
        .slice(i + 1)
        .flatMap((posterior) => posterior.objetos)
        .filter((o) => o.tipo === "sin-function")
        .map((o) => o.nombre)
    );
    const objetos = mig.objetos.filter(
      (o) =>
        !((o.tipo === "function" || o.tipo === "function-contiene") && borradasDespues.has(o.nombre))
    );
    return { ...mig, objetos };
  })
  .filter((mig) => !desde || mig.archivo >= desde);

const filas = migraciones.map(({ version, nombre, objetos }) => {
  const faltantes = objetos.length
    ? `array_remove(array[${objetos
        .map((o) => {
          const etiqueta = `${o.tipo} ${o.nombre}${o.resto ? ` (${o.resto})` : ""}`;
          // sin-function falla cuando SÍ existe; el resto, cuando NO existe.
          const condicion =
            o.tipo === "sin-function"
              ? `not ${existe(o.tipo, o.nombre, o.resto)}`
              : existe(o.tipo, o.nombre, o.resto);
          return `case when ${condicion} then null else ${q(etiqueta)} end`;
        })
        .join(", ")}], null)`
    : `'{}'::text[]`;
  return `  (${q(version)}, ${q(nombre)}, ${objetos.length}, ${faltantes})`;
});

const versiones = migraciones.map((m) => q(m.version)).join(", ");

console.log(`-- Generado por scripts/db/verificar-migraciones.mjs (solo lectura).
-- Ejecútalo en Supabase. Todas las filas deben decir estado = 'OK'.
--   REVISAR            -> no está en el historial o faltan objetos (ver objetos_faltantes).
--   SOLO_EN_LA_BASE    -> está aplicada en la base pero no hay archivo en el repo.
select m.version, m.name,
  exists (select 1 from supabase_migrations.schema_migrations s where s.version = m.version) as en_historial,
  m.objetos_esperados,
  m.objetos_faltantes,
  case
    when exists (select 1 from supabase_migrations.schema_migrations s where s.version = m.version)
         and cardinality(m.objetos_faltantes) = 0 then 'OK'
    else 'REVISAR'
  end as estado
from (values
${filas.join(",\n")}
) as m(version, name, objetos_esperados, objetos_faltantes)
union all
select s.version, s.name, true, 0, '{}'::text[], 'SOLO_EN_LA_BASE'
from supabase_migrations.schema_migrations s
where s.version not in (${versiones})${desde ? `\n  and s.version >= ${q(desde)}` : ""}
order by 1;`);
