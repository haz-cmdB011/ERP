// Service worker del ERP: solo recibe notificaciones (Web Push) y abre la pantalla correcta al tocarlas.
// NO guarda nada en caché ni intercepta peticiones: la app se comporta igual que sin él.
// Si se cambia este archivo, el navegador lo actualiza solo (se sirve sin caché; ver next.config.ts).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

// Llega un aviso del servidor: { titulo, cuerpo, url, etiqueta }. Siempre se muestra algo: el navegador lo exige
// (userVisibleOnly) y, si no, deja de entregar avisos.
self.addEventListener("push", (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = {};
  }
  const titulo = typeof datos.titulo === "string" && datos.titulo ? datos.titulo.slice(0, 80) : "ERP Mobiliarium";
  const opciones = {
    body: typeof datos.cuerpo === "string" ? datos.cuerpo.slice(0, 200) : "",
    icon: "/icons/icon-192.png",
    tag: typeof datos.etiqueta === "string" && datos.etiqueta ? datos.etiqueta : undefined,
    data: { url: typeof datos.url === "string" ? datos.url : "/" },
  };
  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

// Al tocar el aviso: se enfoca la app si ya está abierta (y se lleva a la pantalla del aviso) o se abre.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  // Solo se abren pantallas de este mismo sitio.
  let destino;
  try {
    const crudo = evento.notification.data && typeof evento.notification.data.url === "string" ? evento.notification.data.url : "/";
    destino = new URL(crudo, self.location.origin);
  } catch {
    destino = new URL("/", self.location.origin);
  }
  if (destino.origin !== self.location.origin) destino = new URL("/", self.location.origin);

  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const ventana of ventanas) {
        if (new URL(ventana.url).origin === self.location.origin && "focus" in ventana) {
          return ventana.focus().then((v) => ("navigate" in v ? v.navigate(destino.href) : v));
        }
      }
      return self.clients.openWindow(destino.href);
    })
  );
});
