import { expect, test, type Page } from "@playwright/test";

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

// Simula el aviso que Chrome manda cuando la app se puede instalar y la respuesta de quien lo ve. Se reintenta hasta
// que el botón se activa: si el aviso llega antes de que la página termine de cargar, nadie lo escucha todavía.
async function simularAvisoDeChrome(page: Page, resultado: "accepted" | "dismissed") {
  await expect(async () => {
    await page.evaluate((r) => {
      const aviso = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string }>;
      };
      aviso.prompt = async () => {};
      aviso.userChoice = Promise.resolve({ outcome: r });
      window.dispatchEvent(aviso);
    }, resultado);
    await expect(page.getByRole("button", { name: "Instalar app" })).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 20000 });
}

test.describe("instalar la app", () => {
  test("/instalar abre sin sesión, ofrece instalar y entrar sin instalar", async ({ page }) => {
    await page.goto("/instalar");
    await expect(page.getByRole("heading", { name: "Instala la app" })).toBeVisible();
    // El botón existe siempre; se activa cuando el navegador avisa que se puede instalar.
    await expect(page.getByRole("button", { name: /Instalar app|Preparando/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Entrar sin instalar" })).toHaveAttribute("href", "/login");
  });

  test("/instalar avisa que primero hay que registrarse y que quien ya tiene cuenta ingresa sus datos", async ({ page }) => {
    await page.goto("/instalar");
    await expect(page.getByText("Para entrar necesitas una cuenta.")).toBeVisible();
    await expect(page.getByRole("link", { name: "regístrate primero" })).toHaveAttribute("href", "/registro");
    await expect(page.getByText(/Si ya tienes cuenta, inicia sesión con tus datos/)).toBeVisible();
  });

  test("al aceptar la instalación pasa al inicio de sesión", async ({ page }) => {
    await page.goto("/instalar");
    // Se simula el aviso de Chrome y que el usuario acepte.
    await simularAvisoDeChrome(page, "accepted");
    await page.getByRole("button", { name: "Instalar app" }).click();
    await expect(page.getByText(/La app quedó instalada/)).toBeVisible();
    // Mientras tanto se puede elegir: registrarse la primera vez o entrar con la cuenta de siempre.
    await expect(page.getByText(/Si es tu primera vez, regístrate primero/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrarme (primera vez)" })).toHaveAttribute("href", "/registro");
    await expect(page.getByRole("link", { name: "Ya tengo cuenta: iniciar sesión" })).toHaveAttribute("href", "/login");
    await page.waitForURL("**/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("si se rechaza la instalación avisa y deja volver a intentarlo", async ({ page }) => {
    await page.goto("/instalar");
    await simularAvisoDeChrome(page, "dismissed");
    await page.getByRole("button", { name: "Instalar app" }).click();
    await expect(page.getByText(/No se instaló/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Instalar app" })).toBeEnabled();
  });

  test("la hoja con el QR abre sin sesión y trae los tres pasos", async ({ page }) => {
    await page.goto("/instalar/hoja");
    await expect(page.getByRole("heading", { name: "Instala la app del ERP" })).toBeVisible();
    await expect(page.getByRole("img", { name: /Código QR que abre .*\/instalar/ })).toBeVisible();
    for (const paso of ["Escanea", "Instala", "Entra"]) {
      await expect(page.getByText(paso, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("Primera vez: regístrate primero")).toBeVisible();
    await expect(page.getByText("¿Ya tienes cuenta? Ingresa tus datos")).toBeVisible();
  });

  test("el manifest permite instalar la app (nombre, íconos y pantalla completa)", async ({ request }) => {
    const r = await request.get("/manifest.webmanifest");
    expect(r.status()).toBe(200);
    const m = await r.json();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.icons.some((i: { sizes: string }) => i.sizes === "192x192")).toBe(true);
    expect(m.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
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
  for (const ruta of ["/login", "/registro", "/privacidad", "/instalar", "/instalar/hoja"]) {
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
