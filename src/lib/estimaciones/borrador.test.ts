import { describe, expect, it } from "vitest";
import {
  VIGENCIA_BORRADOR_MS,
  claveBorrador,
  haceCuanto,
  leerBorrador,
  serializarBorrador,
  sinCamposDePantalla,
} from "./borrador";

const AHORA = new Date("2026-10-07T12:00:00Z");

describe("borrador de recibo", () => {
  it("separa los borradores por tipo y por persona", () => {
    expect(claveBorrador("armado", "u1")).not.toBe(claveBorrador("acabados", "u1"));
    expect(claveBorrador("armado", "u1")).not.toBe(claveBorrador("armado", "u2"));
  });

  it("guarda y vuelve a leer los datos", () => {
    const texto = serializarBorrador({ folio: "1677", renglones: [{ modelo: "ZOCLO" }] }, AHORA);
    const b = leerBorrador<{ folio: string }>(texto, new Date(AHORA.getTime() + 60_000));
    expect(b?.datos.folio).toBe("1677");
    expect(b?.guardadoEn).toBe(AHORA.toISOString());
  });

  it("ignora lo vacío, dañado o de otra versión", () => {
    expect(leerBorrador(null, AHORA)).toBeNull();
    expect(leerBorrador("{no es json", AHORA)).toBeNull();
    expect(leerBorrador(JSON.stringify({ version: 99, guardadoEn: AHORA.toISOString(), datos: {} }), AHORA)).toBeNull();
    expect(leerBorrador(JSON.stringify({ version: 1, guardadoEn: AHORA.toISOString() }), AHORA)).toBeNull();
  });

  it("no ofrece un borrador vencido ni uno con fecha futura", () => {
    const texto = serializarBorrador({ a: 1 }, AHORA);
    expect(leerBorrador(texto, new Date(AHORA.getTime() + VIGENCIA_BORRADOR_MS + 1))).toBeNull();
    expect(leerBorrador(texto, new Date(AHORA.getTime() - 1000))).toBeNull();
  });

  it("quita los campos que solo existen en pantalla", () => {
    expect(sinCamposDePantalla([{ id: 7, colapsado: true, modelo: "G-1", cantidad: 3 }])).toEqual([
      { modelo: "G-1", cantidad: 3 },
    ]);
  });

  it("dice hace cuánto se guardó", () => {
    const antes = (ms: number) => new Date(AHORA.getTime() - ms).toISOString();
    expect(haceCuanto(antes(10_000), AHORA)).toBe("hace un momento");
    expect(haceCuanto(antes(5 * 60_000), AHORA)).toBe("hace 5 min");
    expect(haceCuanto(antes(3 * 3600_000), AHORA)).toBe("hace 3 h");
    expect(haceCuanto(antes(24 * 3600_000), AHORA)).toBe("hace 1 día");
    expect(haceCuanto(antes(3 * 24 * 3600_000), AHORA)).toBe("hace 3 días");
  });
});
