import { describe, expect, it } from "vitest";
import {
  crearLimitadorPorIp,
  dominioPermitido,
  dominiosPermitidos,
  emailValido,
  ipDe,
} from "./registro";

describe("emailValido", () => {
  it("acepta correos normales y rechaza los mal formados o larguísimos", () => {
    expect(emailValido("ana@mobiliarium.com")).toBe(true);
    expect(emailValido("sin-arroba.com")).toBe(false);
    expect(emailValido("a b@x.com")).toBe(false);
    expect(emailValido("@x.com")).toBe(false);
    expect(emailValido(`${"a".repeat(250)}@x.com`)).toBe(false);
  });
});

describe("dominios permitidos", () => {
  it("sin configurar no restringe", () => {
    expect(dominiosPermitidos(undefined)).toEqual([]);
    expect(dominioPermitido("cualquiera@gmail.com", [])).toBe(true);
  });
  it("con lista, solo deja pasar esos dominios (sin importar mayúsculas)", () => {
    const lista = dominiosPermitidos(" Mobiliarium.com, @gcdi.com.mx ,");
    expect(lista).toEqual(["mobiliarium.com", "gcdi.com.mx"]);
    expect(dominioPermitido("ana@MOBILIARIUM.com", lista)).toBe(true);
    expect(dominioPermitido("ana@gcdi.com.mx", lista)).toBe(true);
    expect(dominioPermitido("ana@gmail.com", lista)).toBe(false);
    expect(dominioPermitido("ana@mobiliarium.com.evil.io", lista)).toBe(false);
  });
});

describe("limitador por IP", () => {
  it("permite hasta el máximo y bloquea el siguiente dentro de la ventana", () => {
    const excede = crearLimitadorPorIp(3, 1000);
    expect([excede("1.1.1.1", 0), excede("1.1.1.1", 10), excede("1.1.1.1", 20)]).toEqual([false, false, false]);
    expect(excede("1.1.1.1", 30)).toBe(true);
  });
  it("cada IP lleva su propia cuenta y la ventana se libera con el tiempo", () => {
    const excede = crearLimitadorPorIp(1, 1000);
    expect(excede("1.1.1.1", 0)).toBe(false);
    expect(excede("1.1.1.1", 500)).toBe(true);
    expect(excede("2.2.2.2", 500)).toBe(false);
    expect(excede("1.1.1.1", 1500)).toBe(false);
  });
});

describe("ipDe", () => {
  it("toma el primer valor de x-forwarded-for", () => {
    const peticion = new Request("https://x.test", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } });
    expect(ipDe(peticion)).toBe("9.9.9.9");
    expect(ipDe(new Request("https://x.test"))).toBe("desconocida");
  });
});
