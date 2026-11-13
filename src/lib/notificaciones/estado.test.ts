import { describe, expect, it } from "vitest";
import { claveVapidABytes, estadoNotificaciones, type DatosNotificaciones } from "./estado";

const base: DatosNotificaciones = {
  soportado: true,
  permiso: "default",
  suscrito: false,
  configurado: true,
  plataforma: "android",
  enApp: false,
};
const con = (extra: Partial<DatosNotificaciones>) => estadoNotificaciones({ ...base, ...extra });

describe("estadoNotificaciones", () => {
  it("sin permiso todavía: se puede activar", () => {
    expect(con({})).toBe("sin-activar");
    // Permiso dado pero sin suscripción guardada (se limpió): hay que volver a activar.
    expect(con({ permiso: "granted", suscrito: false })).toBe("sin-activar");
  });

  it("con permiso y suscripción: activas", () => {
    expect(con({ permiso: "granted", suscrito: true })).toBe("activas");
  });

  it("bloqueadas por la persona", () => {
    expect(con({ permiso: "denied" })).toBe("bloqueado");
  });

  it("el navegador no sabe de notificaciones o el servidor no tiene sus llaves", () => {
    expect(con({ soportado: false, permiso: "no-disponible" })).toBe("no-soportado");
    expect(con({ configurado: false })).toBe("sin-configurar");
  });

  it("en iPhone hay que instalar la app primero; ya instalada, funciona como en Android", () => {
    expect(con({ plataforma: "ios", enApp: false, soportado: false })).toBe("ios-sin-instalar");
    expect(con({ plataforma: "ios", enApp: true })).toBe("sin-activar");
    expect(con({ plataforma: "ios", enApp: true, permiso: "granted", suscrito: true })).toBe("activas");
  });
});

describe("claveVapidABytes", () => {
  it("convierte la llave base64url en los bytes que pide el navegador", () => {
    // "AQID" = 1, 2, 3; con guiones y guiones bajos en lugar de + y /.
    expect([...claveVapidABytes("AQID")]).toEqual([1, 2, 3]);
    expect([...claveVapidABytes("-_8")]).toEqual([251, 255]);
  });

  it("una llave pública VAPID de 87 caracteres da 65 bytes", () => {
    expect(claveVapidABytes("B" + "A".repeat(86)).length).toBe(65);
  });
});
