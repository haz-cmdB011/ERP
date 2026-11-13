import { describe, expect, it } from "vitest";
import { instalaConBoton, plataformaDe, textoBoton } from "./instalar-app";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

describe("plataformaDe", () => {
  it("distingue iPhone, Android y escritorio", () => {
    expect(plataformaDe(IPHONE)).toBe("ios");
    expect(plataformaDe(ANDROID_CHROME)).toBe("android");
    expect(plataformaDe(WINDOWS_CHROME)).toBe("escritorio");
    expect(plataformaDe(MAC_SAFARI)).toBe("escritorio");
  });

  it("un iPad que se anuncia como Mac se reconoce por su pantalla táctil", () => {
    expect(plataformaDe(MAC_SAFARI, 5)).toBe("ios");
    expect(plataformaDe(MAC_SAFARI, 0)).toBe("escritorio");
  });

  it("lo que no se reconoce queda como otra", () => {
    expect(plataformaDe("")).toBe("otra");
    expect(plataformaDe("curl/8.0")).toBe("otra");
  });
});

describe("instalaConBoton", () => {
  it("solo Android y escritorio (Chrome) piden la instalación con un botón", () => {
    expect(instalaConBoton("android")).toBe(true);
    expect(instalaConBoton("escritorio")).toBe(true);
    expect(instalaConBoton("ios")).toBe(false);
    expect(instalaConBoton("otra")).toBe(false);
  });
});

describe("textoBoton", () => {
  it("dice qué pasa en cada momento y se puede volver a intentar tras rechazar", () => {
    expect(textoBoton("preparando")).toBe("Preparando…");
    expect(textoBoton("listo")).toBe("Instalar app");
    expect(textoBoton("instalando")).toBe("Instalando…");
    expect(textoBoton("instalada")).toBe("Instalada");
    expect(textoBoton("rechazada")).toBe("Instalar app");
  });
});
