// Conciliación de lo capturado en un recibo (Acabados, Armado o
// Electrificación) contra lo que Planeación declaró en el PM. Es el espejo en
// pantalla del trigger est_conciliar_renglon_pm
// (supabase/migrations/20260930191049_control_pm_recibos.sql): renglón por
// renglón, en orden, por modelo de la OT, lo ya registrado en otros recibos
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

export type EstadoConciliacion =
  // El modelo no está entre los del PM de la OT: no hay con qué comparar.
  | { estado: "sin_modelo_en_pm" }
  | { estado: "dentro"; cantidadPm: number; acumulada: number }
  | { estado: "excede"; cantidadPm: number; acumulada: number; excedente: number };

export interface SaldoModeloPm {
  cantidadPm: number;
  // Lo ya capturado en otros recibos vigentes del área (sin el que se edita).
  cantidadRegistrada: number;
}

export interface RenglonConciliable {
  modelo: string;
  cantidad: number | "";
  // false para un reproceso: no gasta saldo del PM ni se concilia.
  cuentaParaPm?: boolean;
}

// Un resultado por renglón (mismo orden); null en los renglones que no se
// concilian (sin modelo o reproceso). La clave de saldoPorModelo es
// claveModelo(modelo).
export function conciliarRenglones(
  renglones: RenglonConciliable[],
  saldoPorModelo: Map<string, SaldoModeloPm>
): (EstadoConciliacion | null)[] {
  const capturadoHasta = new Map<string, number>();
  return renglones.map((r) => {
    const clave = claveModelo(r.modelo);
    if (!clave || r.cuentaParaPm === false) return null;
    const previo = capturadoHasta.get(clave) ?? 0;
    const conEste = previo + (Number(r.cantidad) || 0);
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
