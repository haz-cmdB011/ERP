// Conciliación de lo capturado en un recibo (Acabados, Armado o
// Electrificación) contra lo que Planeación declaró en los PM de su OT. Es el
// espejo en pantalla del trigger est_conciliar_renglon_pm
// (supabase/migrations/20261002154916_variantes_modelo_iluminacion.sql):
// renglón por renglón, en orden, por variante del modelo en la OT (código +
// descripción del padre; por código si el renglón no trae una variante de la
// OT), lo ya registrado en otros recibos
// vigentes del área más lo capturado hasta ese renglón no debe superar lo
// declarado. Capturar de menos está bien (entregas parciales). Los reprocesos
// no cuentan. Esto solo adelanta el aviso para pedir el motivo antes de
// guardar; la base sigue siendo quien lo exige.

const CON_ACENTO = "áéíóúüÁÉÍÓÚÜ";
const SIN_ACENTO = "aeiouuAEIOUU";

// Clave con la que se compara un modelo contra el PM: sin acentos, en
// mayúsculas y sin espacios, guiones, puntos ni otros signos ("MS-01",
// "MS 01" y "ms01" son el mismo). Espejo de norm_modelo en la base
// (supabase/migrations/20260930194232_reglas_modelo_iluminacion.sql).
export function claveModelo(modelo: string | null | undefined): string {
  return String(modelo ?? "")
    .replace(/[áéíóúüÁÉÍÓÚÜ]/g, (c) => SIN_ACENTO[CON_ACENTO.indexOf(c)])
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]/g, "");
}

// OT con la que se agrupan recibos y PM: "2PM193-24", "PM193-24 SOTANO 1",
// "193-24", "OT 193-24" y "193-24-2 ..." son la OT "193-24"; cualquier otro
// texto queda tal cual en mayúsculas. Espejo de ot_clave en la base
// (supabase/migrations/20261001194636_recibos_por_ot.sql).
export function claveOt(texto: string | null | undefined): string | null {
  const t = String(texto ?? "");
  const deCodigo =
    t.match(/PM\s*(\d+-\d{2})(?!\d)/i)?.[1] ?? t.match(/^\s*(?:O\.?\s*T\.?\s*)?(\d+-\d{2})(?!\d)/i)?.[1];
  return deCodigo ?? (t.trim() ? t.trim().toUpperCase() : null);
}

// Clave de la descripción de un padre del PM: sin acentos, en minúsculas y sin
// espacios ni signos. Espejo de norm_descripcion en la base
// (supabase/migrations/20261002154916_variantes_modelo_iluminacion.sql).
export function claveDescripcion(descripcion: string | null | undefined): string {
  return String(descripcion ?? "")
    .replace(/[áéíóúüÁÉÍÓÚÜ]/g, (c) => SIN_ACENTO[CON_ACENTO.indexOf(c)])
    .toLowerCase()
    .replace(/[^a-z0-9ñ]/g, "");
}

// Clave de una variante de modelo (código + descripción del padre). Dos padres
// con el mismo código y la misma descripción son el mismo modelo aunque vengan
// en PM distintos; "MUEBLE · cama king" y "MUEBLE · cama queen" no.
export function claveVariante(modelo: string | null | undefined, descripcion: string | null | undefined): string {
  return `${claveModelo(modelo)}|${claveDescripcion(descripcion)}`;
}

export type EstadoConciliacion =
  // El modelo no está entre los del PM de la OT: no hay con qué comparar.
  | { estado: "sin_modelo_en_pm" }
  | { estado: "dentro"; cantidadPm: number; acumulada: number }
  | { estado: "excede"; cantidadPm: number; acumulada: number; excedente: number };

export interface SaldoModeloPm {
  cantidadPm: number;
  // Lo ya capturado en otros recibos vigentes del área (sin el que se edita).
  cantidadRegistrada: number;
  // Solo en el saldo por código: la clave de su variante si es la única en la
  // OT (la base liga ahí un renglón que no trae descripción).
  varianteUnica?: string;
}

// Variante de modelo de la OT tal como la devuelve la base.
export interface VarianteModeloPm {
  modelo: string;
  descripcionPm: string;
  cantidadPm: number;
  cantidadRegistrada: number;
}

// Saldos para conciliarRenglones: uno por variante (claveVariante) y uno por
// código (claveModelo, la suma de sus variantes) para los renglones que no
// traen una variante de la OT.
export function saldosDeVariantes(variantes: VarianteModeloPm[]): Map<string, SaldoModeloPm> {
  const saldos = new Map<string, SaldoModeloPm>();
  const porCodigo = new Map<string, { saldo: SaldoModeloPm; claves: string[] }>();
  for (const v of variantes) {
    const kv = claveVariante(v.modelo, v.descripcionPm);
    saldos.set(kv, { cantidadPm: v.cantidadPm, cantidadRegistrada: v.cantidadRegistrada });
    const km = claveModelo(v.modelo);
    const previo = porCodigo.get(km) ?? { saldo: { cantidadPm: 0, cantidadRegistrada: 0 }, claves: [] };
    previo.saldo.cantidadPm += v.cantidadPm;
    previo.saldo.cantidadRegistrada += v.cantidadRegistrada;
    previo.claves.push(kv);
    porCodigo.set(km, previo);
  }
  for (const [km, { saldo, claves }] of porCodigo) {
    saldos.set(km, claves.length === 1 ? { ...saldo, varianteUnica: claves[0] } : saldo);
  }
  return saldos;
}

// Con qué saldo se compara un renglón: su variante si está en la OT; si no
// trae descripción y el código tiene una sola variante, esa; si no, el código.
export function claveSaldo(
  r: { modelo: string; descripcionPm?: string | null },
  saldos: Map<string, SaldoModeloPm>
): string {
  const km = claveModelo(r.modelo);
  if (r.descripcionPm != null) {
    const kv = claveVariante(r.modelo, r.descripcionPm);
    if (saldos.has(kv)) return kv;
  }
  return saldos.get(km)?.varianteUnica ?? km;
}

export interface RenglonConciliable {
  modelo: string;
  // Descripción del padre elegido en la lista (la variante); null o ausente si
  // se escribió el modelo a mano.
  descripcionPm?: string | null;
  cantidad: number | "";
  // false para un reproceso: no gasta saldo del PM ni se concilia.
  cuentaParaPm?: boolean;
}

// Un resultado por renglón (mismo orden); null en los renglones que no se
// concilian (sin modelo o reproceso). Las claves de saldoPorModelo son las de
// saldosDeVariantes (o solo claveModelo, para comparar por código).
export function conciliarRenglones(
  renglones: RenglonConciliable[],
  saldoPorModelo: Map<string, SaldoModeloPm>
): (EstadoConciliacion | null)[] {
  // Lo capturado en este recibo hasta cada renglón, por variante y por código
  // (el saldo por código cuenta todas sus variantes, como en la base).
  const capturadoHasta = new Map<string, number>();
  return renglones.map((r) => {
    const km = claveModelo(r.modelo);
    if (!km || r.cuentaParaPm === false) return null;
    const clave = claveSaldo(r, saldoPorModelo);
    const cantidad = Number(r.cantidad) || 0;
    if (clave !== km) capturadoHasta.set(km, (capturadoHasta.get(km) ?? 0) + cantidad);
    const conEste = (capturadoHasta.get(clave) ?? 0) + cantidad;
    capturadoHasta.set(clave, conEste);

    const saldo = saldoPorModelo.get(clave);
    if (!saldo) return { estado: "sin_modelo_en_pm" };
    const acumulada = saldo.cantidadRegistrada + conEste;
    if (acumulada > saldo.cantidadPm) {
      return {
        estado: "excede",
        cantidadPm: saldo.cantidadPm,
        acumulada,
        excedente: acumulada - saldo.cantidadPm,
      };
    }
    return { estado: "dentro", cantidadPm: saldo.cantidadPm, acumulada };
  });
}

// ¿Este resultado exige motivo? (lo mismo que hace fallar al trigger).
export function requiereMotivo(c: EstadoConciliacion | null): boolean {
  return c !== null && c.estado !== "dentro";
}
