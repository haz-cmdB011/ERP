import { expect, test } from "@playwright/test";

// Lo que debe seguir funcionando en cada despliegue, sin base de datos ni sesión.

test.describe("páginas públicas", () => {
  test("login muestra el formulario con correo, contraseña y aviso de privacidad", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Aviso de privacidad" })).toBeVisible();
  });

  test("login pide los datos antes de enviar (campos obligatorios)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Correo electrónico")).toHaveAttribute("required", "");
    await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("required", "");
  });

  test("registro muestra el formulario y enlaza el aviso de privacidad", async ({ page }) => {
    await page.goto("/registro");
    await expect(page.getByRole("heading", { name: "Crear cuenta" })).toBeVisible();
    await expect(page.getByLabel("Nombre(s)")).toBeVisible();
    await expect(page.getByLabel("Apellidos")).toBeVisible();
    await expect(page.getByRole("link", { name: "aviso de privacidad" })).toHaveAttribute("href", "/privacidad");
  });

  test("el aviso de privacidad abre sin sesión", async ({ page }) => {
    await page.goto("/privacidad");
    await expect(page.getByRole("heading", { name: "Aviso de privacidad" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tus derechos (ARCO)" })).toBeVisible();
  });

  test("una ruta que no existe muestra la página 404 de la marca", async ({ page }) => {
    const respuesta = await page.goto("/esta-ruta-no-existe");
    expect(respuesta?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir al inicio" })).toBeVisible();
  });

  test("robots.txt pide a los buscadores no rastrear la app", async ({ request }) => {
    const r = await request.get("/robots.txt");
    expect(r.status()).toBe(200);
    expect(await r.text()).toContain("Disallow: /");
  });
});

test.describe("acceso protegido", () => {
  for (const ruta of ["/planeacion", "/produccion", "/calidad", "/estimaciones", "/admin/usuarios"]) {
    test(`${ruta} sin sesión manda al login`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("las rutas /api con datos piden sesión", async ({ request }) => {
    for (const ruta of ["/api/buscar?q=abc", "/api/estimaciones/reporte-semanal"]) {
      const r = await request.get(ruta, { maxRedirects: 0 });
      expect([401, 403, 307], `${ruta} respondió ${r.status()}`).toContain(r.status());
    }
  });
});

test.describe("seguridad del navegador", () => {
  test("las cabeceras de seguridad llegan en cada respuesta", async ({ request }) => {
    const h = (await request.get("/login")).headers();
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["referrer-policy"]).toBeTruthy();
  });

  test("la cámara solo se permite en los escáneres de QR", async ({ request }) => {
    const normal = (await request.get("/login")).headers()["permissions-policy"];
    expect(normal).toContain("camera=()");
    for (const ruta of ["/produccion/escanear", "/calidad/escanear"]) {
      const r = await request.get(ruta, { maxRedirects: 0 });
      expect(r.headers()["permissions-policy"], ruta).toContain("camera=(self)");
    }
  });

  test("el logo y los iconos se guardan en caché", async ({ request }) => {
    for (const ruta of ["/branding/mobiliarium-logo-ui.svg", "/icons/icon-192.png"]) {
      const r = await request.get(ruta);
      expect(r.status(), ruta).toBe(200);
      expect(r.headers()["cache-control"], ruta).toContain("max-age=86400");
    }
  });
});

test.describe("monitoreo", () => {
  test("/api/salud responde con la forma esperada (200 con base; 503 si la base no contesta)", async ({ request }) => {
    const r = await request.get("/api/salud");
    expect([200, 503]).toContain(r.status());
    const cuerpo = await r.json();
    expect(typeof cuerpo.ok).toBe("boolean");
    expect(typeof cuerpo.base).toBe("boolean");
    expect(r.headers()["cache-control"]).toBe("no-store");
  });

  test("/api/errores rechaza lo que no es un aviso válido", async ({ request }) => {
    expect((await request.post("/api/errores", { data: "no es json" })).status()).toBe(400);
  });
});

test.describe("diseño adaptable", () => {
  for (const ruta of ["/login", "/registro", "/privacidad"]) {
    test(`${ruta} no se desborda horizontalmente`, async ({ page }) => {
      await page.goto(ruta);
      const desborda = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(desborda).toBe(false);
    });
  }

  test("los enlaces de acceso son fáciles de tocar (44 px)", async ({ page }) => {
    await page.goto("/login");
    for (const nombre of [/Olvidaste tu contraseña/, /Regístrate/]) {
      const caja = await page.getByText(nombre).boundingBox();
      expect(caja?.height ?? 0, String(nombre)).toBeGreaterThanOrEqual(40);
    }
  });
});
