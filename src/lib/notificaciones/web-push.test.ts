import { createECDH, randomBytes } from "node:crypto";
import { generateRequestDetails, generateVAPIDKeys, sendNotification } from "web-push";
import { describe, expect, it } from "vitest";
import { armarCarga } from "./carga";
import { validarSuscripcion } from "./suscripcion";

// Prueba con la librería de verdad (sin red): los demás tests la simulan y no verían que cambie su forma de
// importarse o sus opciones. Aquí se cifra un aviso como lo haría un celular real.
const base64Url = (b: Buffer) => b.toString("base64url");

function suscripcionDeUnCelular() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/prueba-1234",
    keys: { p256dh: base64Url(ecdh.getPublicKey()), auth: base64Url(randomBytes(16)) },
  };
}

describe("web-push (librería real)", () => {
  it("se importa por nombre y genera llaves VAPID del largo esperado", () => {
    expect(typeof sendNotification).toBe("function");
    const k = generateVAPIDKeys();
    expect(k.publicKey).toHaveLength(87);
    expect(k.privateKey).toHaveLength(43);
  });

  it("una suscripción como la de un celular pasa nuestra validación", () => {
    const s = suscripcionDeUnCelular();
    expect(validarSuscripcion(s).ok).toBe(true);
  });

  it("cifra el aviso con las opciones que usa enviarASuscripciones y firma con VAPID", () => {
    const vapid = generateVAPIDKeys();
    const s = suscripcionDeUnCelular();
    const carga = armarCarga({ titulo: "Se liberó un mueble", cuerpo: "O.T. 009-26", url: "/produccion/panel" });
    const detalles = generateRequestDetails(s, carga, {
      vapidDetails: { subject: "mailto:ti@mobiliarium.com", publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 3600,
      urgency: "normal",
    });
    expect(detalles.method).toBe("POST");
    expect(detalles.endpoint).toBe(s.endpoint);
    const cabeceras = detalles.headers as Record<string, string | number>;
    expect(Number(cabeceras.TTL)).toBe(3600);
    expect(cabeceras.Urgency).toBe("normal");
    expect(String(cabeceras.Authorization)).toMatch(/^vapid /);
    // El cuerpo viaja cifrado: ni el título ni el texto aparecen en claro.
    const cuerpo = (detalles.body as Buffer).toString("latin1");
    expect(cuerpo).not.toContain("Se liberó");
    expect(cuerpo).not.toContain("009-26");
  });
});
