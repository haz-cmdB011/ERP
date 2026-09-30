import { afterEach, describe, expect, it, vi } from "vitest";
import { contrasenaFiltrada } from "./contrasena-filtrada";

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const PREFIJO = "5BAA6";
const SUFIJO = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

function respuesta(texto: string, ok = true) {
  return { ok, text: async () => texto } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("contrasenaFiltrada", () => {
  it("detecta una contraseña que aparece en la lista y solo envía el prefijo del hash", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFIJO}:9545824\r\n`));
    vi.stubGlobal("fetch", fetchMock);

    expect(await contrasenaFiltrada("password")).toBe(true);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIJO}`);
    // Solo el prefijo de 5 caracteres viaja en la ruta: ni la contraseña ni el resto del hash.
    const ruta = new URL(url).pathname;
    expect(ruta).toBe(`/range/${PREFIJO}`);
    expect(ruta).not.toContain("password");
    expect(url).not.toContain(SUFIJO);
  });

  it("no marca una contraseña que no está en la lista", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta("0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n")));
    expect(await contrasenaFiltrada("password")).toBe(false);
  });

  it("ignora las entradas de relleno con conteo 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(`${SUFIJO}:0\r\n`)));
    expect(await contrasenaFiltrada("password")).toBe(false);
  });

  it("falla abierto: si el servicio no responde no bloquea", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")));
    expect(await contrasenaFiltrada("password")).toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta("error", false)));
    expect(await contrasenaFiltrada("password")).toBe(false);
  });

  it("una contraseña vacía no consulta nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await contrasenaFiltrada("")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
