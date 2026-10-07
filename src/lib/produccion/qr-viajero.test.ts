import { describe, expect, it } from "vitest";
import { esUuid, itemDeQrViajero } from "./qr-viajero";

const PEDIDO = "0b9a7f5e-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
const ITEM = "7d6c5b4a-3f2e-4d1c-9b8a-7f6e5d4c3b2a";
const ruta = `/produccion/pedidos/${PEDIDO}/viajero/${ITEM}`;

describe("itemDeQrViajero", () => {
  it("lee los ids del QR que imprime la hoja de viajero", () => {
    expect(itemDeQrViajero(`https://erp.example.com${ruta}`)).toEqual({ pedidoId: PEDIDO, itemId: ITEM });
  });

  it("acepta localhost, diagonal final, parámetros y espacios alrededor", () => {
    expect(itemDeQrViajero(`http://localhost:3000${ruta}/`)?.itemId).toBe(ITEM);
    expect(itemDeQrViajero(`https://x.com${ruta}?ref=qr#arriba`)?.itemId).toBe(ITEM);
    expect(itemDeQrViajero(`  https://x.com${ruta}\n`)?.itemId).toBe(ITEM);
  });

  it("normaliza los ids a minúsculas", () => {
    const r = itemDeQrViajero(`https://x.com${ruta.toUpperCase()}`);
    expect(r).toEqual({ pedidoId: PEDIDO, itemId: ITEM });
  });

  it("rechaza lo que no es un viajero", () => {
    expect(itemDeQrViajero("PRD-000123")).toBeNull();
    expect(itemDeQrViajero("")).toBeNull();
    expect(itemDeQrViajero(`https://x.com/produccion/pedidos/${PEDIDO}`)).toBeNull();
    expect(itemDeQrViajero(`https://x.com/planeacion/pedidos/${PEDIDO}/viajero/${ITEM}`)).toBeNull();
    expect(itemDeQrViajero(`https://x.com${ruta}/extra`)).toBeNull();
    expect(itemDeQrViajero(`https://x.com/produccion/pedidos/123/viajero/456`)).toBeNull();
  });

  it("rechaza protocolos que no son web", () => {
    expect(itemDeQrViajero(`javascript:alert(1)//${ruta}`)).toBeNull();
    expect(itemDeQrViajero(`ftp://x.com${ruta}`)).toBeNull();
    expect(itemDeQrViajero(`data:text/html,${ruta}`)).toBeNull();
  });
});

describe("esUuid", () => {
  it("solo acepta uuid completos", () => {
    expect(esUuid(ITEM)).toBe(true);
    expect(esUuid(ITEM.toUpperCase())).toBe(true);
    expect(esUuid(`${ITEM}x`)).toBe(false);
    expect(esUuid("../etc")).toBe(false);
    expect(esUuid(undefined)).toBe(false);
  });
});
