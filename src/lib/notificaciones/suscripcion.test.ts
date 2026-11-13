import { describe, expect, it } from "vitest";
import { esServicioDePush, validarSuscripcion } from "./suscripcion";

const P256DH = "B" + "A".repeat(86); // 87 caracteres, como la llave pública real
const AUTH = "A".repeat(22);
const FCM = "https://fcm.googleapis.com/fcm/send/abc123";

const suscripcion = (extra: Record<string, unknown> = {}) => ({ endpoint: FCM, keys: { p256dh: P256DH, auth: AUTH }, ...extra });

describe("esServicioDePush", () => {
  it("acepta los servicios de push de Chrome, Firefox, Safari y Edge", () => {
    expect(esServicioDePush("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(esServicioDePush("https://fcm.googleapis.com/wp/x")).toBe(true);
    expect(esServicioDePush("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(esServicioDePush("https://web.push.apple.com/x")).toBe(true);
    expect(esServicioDePush("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
  });

  it("rechaza direcciones internas, http y dominios que solo parecen de un servicio", () => {
    for (const mala of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.5/x",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evil.com/fcm.googleapis.com",
      "https://usuario:clave@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "ftp://fcm.googleapis.com/x",
      "no es una dirección",
      "",
    ]) {
      expect(esServicioDePush(mala), mala).toBe(false);
    }
  });
});

describe("validarSuscripcion", () => {
  it("acepta lo que manda PushSubscription.toJSON()", () => {
    expect(validarSuscripcion(suscripcion())).toEqual({ ok: true, suscripcion: { endpoint: FCM, p256dh: P256DH, auth: AUTH } });
  });

  it("ignora campos de más (por ejemplo, un user_id que alguien intente mandar)", () => {
    const r = validarSuscripcion(suscripcion({ user_id: "otra-persona", expirationTime: null }));
    expect(r.ok && Object.keys(r.suscripcion).sort()).toEqual(["auth", "endpoint", "p256dh"]);
  });

  it("rechaza lo que no es una suscripción", () => {
    for (const mala of [null, undefined, 5, "texto", [], {}, { endpoint: FCM }, { keys: { p256dh: P256DH, auth: AUTH } }]) {
      expect(validarSuscripcion(mala).ok, JSON.stringify(mala)).toBe(false);
    }
  });

  it("rechaza una dirección de un servicio no permitido o demasiado larga", () => {
    expect(validarSuscripcion(suscripcion({ endpoint: "https://evil.com/push" })).ok).toBe(false);
    expect(validarSuscripcion(suscripcion({ endpoint: `${FCM}/${"a".repeat(1100)}` })).ok).toBe(false);
  });

  it("rechaza llaves con formato o largo imposibles", () => {
    const con = (p256dh: unknown, auth: unknown) => validarSuscripcion({ endpoint: FCM, keys: { p256dh, auth } }).ok;
    expect(con(P256DH, AUTH)).toBe(true);
    expect(con("corta", AUTH)).toBe(false);
    expect(con("A".repeat(300), AUTH)).toBe(false);
    expect(con("*".repeat(87), AUTH)).toBe(false);
    expect(con(P256DH, "x")).toBe(false);
    expect(con(P256DH, "A".repeat(100))).toBe(false);
    expect(con(P256DH, "a b c d e f g h i j k l")).toBe(false);
    expect(con(5, AUTH)).toBe(false);
    expect(con(P256DH, null)).toBe(false);
  });
});
