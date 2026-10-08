// Parte de la cola de envíos que usa el navegador: el almacén en IndexedDB, el transporte
// por XMLHttpRequest (con avance de subida), saber quién tiene la sesión, avisar a las demás
// pestañas y mandar la cola sin que dos pestañas lo hagan a la vez. La lógica está en
// cola-envios.ts.

import { createClient } from "@/lib/supabase/client";
import { crearAlmacenIndexedDB } from "./almacen-indexeddb";
import {
  enviarOEncolar,
  enviosDe,
  procesarCola,
  type AlmacenEnvios,
  type Envio,
  type NuevoEnvio,
  type ResultadoEnvio,
  type ResumenProceso,
  type Transporte,
} from "./cola-envios";

const EVENTO_COLA = "erp:cola";
const CANAL = "erp-cola";
const CLAVE_USUARIO = "erp-usuario-id";
// Con red lenta una foto puede tardar; pasado esto se da por perdido el intento (y se
// reintenta más tarde: la clave de envío hace seguro repetirlo).
const ESPERA_MAXIMA_MS = 120_000;

let almacen: AlmacenEnvios | null | undefined;
export function almacenDelNavegador(): AlmacenEnvios | null {
  if (almacen === undefined) {
    try {
      almacen = crearAlmacenIndexedDB();
    } catch {
      almacen = null;
    }
  }
  return almacen;
}

export function hayConexion(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

function formularioDe(envio: Envio): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(envio.campos)) datos.set(campo, valor);
  for (const archivo of envio.archivos) datos.set(archivo.campo, archivo.blob, archivo.nombre);
  return datos;
}

/** POST del envío midiendo el avance de la subida (fetch no lo reporta). Lanza si no hay respuesta. */
export function transporteXhr(onProgreso?: (porcentaje: number) => void): Transporte {
  return (envio) =>
    new Promise((resolver, rechazar) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", envio.url);
      xhr.timeout = ESPERA_MAXIMA_MS;
      xhr.withCredentials = true;
      if (onProgreso) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgreso(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => {
        let error: string | undefined;
        try {
          const json = JSON.parse(xhr.responseText) as { error?: unknown };
          if (typeof json.error === "string") error = json.error;
        } catch {
          // Respuesta sin JSON (p. ej. una página de error del proveedor): sin mensaje.
        }
        resolver({ status: xhr.status, error });
      };
      xhr.onerror = () => rechazar(new Error("red"));
      xhr.ontimeout = () => rechazar(new Error("tiempo"));
      xhr.onabort = () => rechazar(new Error("cancelado"));
      xhr.send(formularioDe(envio));
    });
}

// --- Quién tiene la sesión -------------------------------------------------------------

/**
 * Id de la persona con sesión. Sin red y con el token vencido Supabase no puede renovarlo y
 * no devuelve sesión; por eso se recuerda el último id conocido (solo el id, nada más).
 */
export async function usuarioActualId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getSession();
    const id = data.session?.user.id ?? null;
    if (id) guardarUsuario(id);
    else if (hayConexion()) olvidarUsuario(); // sin sesión y con red: de verdad salió
    if (id) return id;
  } catch {
    // Se cae al último id conocido.
  }
  try {
    return localStorage.getItem(CLAVE_USUARIO);
  } catch {
    return null;
  }
}

export function guardarUsuario(id: string) {
  try {
    localStorage.setItem(CLAVE_USUARIO, id);
  } catch {
    // Almacenamiento bloqueado: se usará getSession.
  }
}

export function olvidarUsuario() {
  try {
    localStorage.removeItem(CLAVE_USUARIO);
  } catch {
    // nada
  }
}

// --- Avisar a la pantalla y a otras pestañas ---------------------------------------------

let canal: BroadcastChannel | null | undefined;
function canalDelNavegador(): BroadcastChannel | null {
  if (canal === undefined) {
    try {
      canal = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANAL);
    } catch {
      canal = null;
    }
  }
  return canal;
}

export function avisarCambioDeCola() {
  window.dispatchEvent(new Event(EVENTO_COLA));
  canalDelNavegador()?.postMessage("cambio");
}

/** Suscripción a cambios de la cola (esta pestaña y las demás). Devuelve cómo cancelarla. */
export function alCambiarLaCola(accion: () => void): () => void {
  window.addEventListener(EVENTO_COLA, accion);
  const otro = canalDelNavegador();
  const alMensaje = () => accion();
  otro?.addEventListener("message", alMensaje);
  return () => {
    window.removeEventListener(EVENTO_COLA, accion);
    otro?.removeEventListener("message", alMensaje);
  };
}

// --- Enviar y sincronizar ------------------------------------------------------------------

/** Manda ya; si no hay red, lo guarda en el aparato para mandarlo después. */
export async function enviarOGuardar(
  datos: Omit<NuevoEnvio, "usuarioId"> & { usuarioId: string | null },
  onProgreso?: (porcentaje: number) => void
): Promise<ResultadoEnvio> {
  const { usuarioId, ...resto } = datos;
  const resultado = await enviarOEncolar(
    { ...resto, usuarioId: usuarioId ?? "" },
    {
      // Sin saber quién es, no se puede guardar: el servidor registraría a otra persona.
      almacen: usuarioId ? almacenDelNavegador() : null,
      transporte: transporteXhr(onProgreso),
      enLinea: hayConexion(),
    }
  );
  if (resultado.estado === "en-cola") avisarCambioDeCola();
  return resultado;
}

/**
 * Manda los pendientes de la persona. Si otra pestaña ya lo está haciendo, no hace nada
 * (devuelve null). `forzar` ignora las esperas ("Enviar ahora").
 */
export async function sincronizarAhora(usuarioId: string, forzar = false): Promise<ResumenProceso | null> {
  const guardado = almacenDelNavegador();
  if (!guardado) return null;
  const correr = () => procesarCola({ almacen: guardado, transporte: transporteXhr(), usuarioId, forzar });

  let resumen: ResumenProceso | null;
  if (typeof navigator !== "undefined" && navigator.locks) {
    resumen = await navigator.locks.request("erp-cola-sincronizar", { ifAvailable: true }, async (candado) =>
      candado ? correr() : null
    );
  } else {
    resumen = await correr();
  }
  if (resumen && (resumen.enviados.length || resumen.rechazados.length || resumen.pendientes)) avisarCambioDeCola();
  return resumen;
}

export async function enviosPendientesDe(usuarioId: string): Promise<Envio[]> {
  const guardado = almacenDelNavegador();
  return guardado ? enviosDe(guardado, usuarioId) : [];
}

export async function descartarEnvio(id: string): Promise<void> {
  await almacenDelNavegador()?.quitar(id);
  avisarCambioDeCola();
}
