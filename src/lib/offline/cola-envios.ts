// Cola de envíos pendientes: cuando una captura (p. ej. la entrega de un mueble con su
// foto) no se puede mandar porque se cayó la red, se guarda completa en el propio
// aparato y se manda sola cuando vuelve la conexión.
//
// Este archivo es el núcleo y no toca el navegador: el almacén (IndexedDB) y el transporte
// (XMLHttpRequest) se le inyectan, así se prueba entero. La parte del navegador está en
// cola-navegador.ts.
//
// Seguridad de los reintentos: cada envío lleva una `id` única que el servidor usa como
// clave de idempotencia (ver src/app/api/produccion/entregas/route.ts). Si la red se corta
// DESPUÉS de que el servidor guardó la captura y la respuesta no llegó, el reintento no la
// duplica.

export type EstadoEnvio = "pendiente" | "rechazado";

export interface ArchivoEnvio {
  campo: string;
  nombre: string;
  blob: Blob;
}

export interface Envio {
  /** Clave única del envío; también viaja al servidor como `claveEnvio`. */
  id: string;
  /** Qué es, para mostrarlo en el aparato: "Mesa de centro · 3 pza". */
  etiqueta: string;
  /** Persona que lo capturó: solo esa sesión puede mandarlo (el servidor la registra como autora). */
  usuarioId: string;
  url: string;
  campos: Record<string, string>;
  archivos: ArchivoEnvio[];
  /** Para agrupar avisos ("ya hay 3 en cola para esta asignación"). */
  grupo?: string;
  cantidad?: number;
  creadoEn: number;
  intentos: number;
  proximoIntento: number;
  estado: EstadoEnvio;
  /** Último motivo (de red o del servidor). */
  error?: string;
}

export interface AlmacenEnvios {
  agregar(envio: Envio): Promise<void>;
  listar(): Promise<Envio[]>;
  actualizar(envio: Envio): Promise<void>;
  quitar(id: string): Promise<void>;
}

export interface RespuestaTransporte {
  status: number;
  /** Mensaje de error que mandó el servidor, si lo hubo. */
  error?: string;
}

/** Manda un envío. Lanza si no hubo respuesta (sin red, tiempo agotado, corte). */
export type Transporte = (envio: Envio) => Promise<RespuestaTransporte>;

export type Clasificacion = "ok" | "reintentable" | "rechazado";

// 2xx: listo. 408, 425, 429 y 5xx (fallas pasajeras del servidor): se vuelve a intentar. El
// resto (400, 401, 403, 404, 409, 413, 422...): el servidor lo vio y lo rechazó; repetirlo
// igual no lo arregla, así que se muestra a la persona.
const REINTENTABLES = new Set([408, 425, 429, 500, 502, 503, 504]);

// Una falla del servidor que no se arregla sola tras tantos intentos deja de reintentarse y
// se le muestra a la persona. Un corte de red nunca llega a este tope: se reintenta siempre.
export const MAX_INTENTOS_SERVIDOR = 8;

export function clasificarEstado(status: number): Clasificacion {
  if (status >= 200 && status < 300) return "ok";
  if (REINTENTABLES.has(status)) return "reintentable";
  return "rechazado";
}

const ESPERAS_MS = [5_000, 15_000, 45_000, 2 * 60_000, 5 * 60_000, 10 * 60_000];

/** Espera antes del siguiente intento: crece y se queda en 10 minutos. */
export function esperaTras(intentos: number): number {
  return ESPERAS_MS[Math.min(Math.max(intentos, 1), ESPERAS_MS.length) - 1];
}

export function nuevaId(): string {
  return globalThis.crypto.randomUUID();
}

export interface NuevoEnvio {
  id?: string;
  etiqueta: string;
  usuarioId: string;
  url: string;
  campos: Record<string, string>;
  archivos: ArchivoEnvio[];
  grupo?: string;
  cantidad?: number;
}

export function crearEnvio(datos: NuevoEnvio, ahora: number = Date.now()): Envio {
  const id = datos.id ?? nuevaId();
  return {
    id,
    etiqueta: datos.etiqueta,
    usuarioId: datos.usuarioId,
    url: datos.url,
    campos: { ...datos.campos, claveEnvio: id },
    archivos: datos.archivos,
    grupo: datos.grupo,
    cantidad: datos.cantidad,
    creadoEn: ahora,
    intentos: 0,
    proximoIntento: ahora,
    estado: "pendiente",
  };
}

export type ResultadoEnvio =
  | { estado: "enviado" }
  | { estado: "en-cola" }
  | { estado: "rechazado"; mensaje: string };

const MENSAJE_RECHAZO = "El servidor no aceptó el envío.";

/** Intenta mandar el envío; devuelve cómo quedó sin tocar el almacén. */
async function intentar(envio: Envio, transporte: Transporte): Promise<
  | { tipo: "ok" }
  | { tipo: "reintentable"; motivo: string; servidor: boolean }
  | { tipo: "rechazado"; mensaje: string }
> {
  try {
    const r = await transporte(envio);
    const clase = clasificarEstado(r.status);
    if (clase === "ok") return { tipo: "ok" };
    if (clase === "reintentable") {
      return { tipo: "reintentable", motivo: r.error ?? `Respuesta ${r.status}`, servidor: true };
    }
    return { tipo: "rechazado", mensaje: r.error ?? MENSAJE_RECHAZO };
  } catch {
    return { tipo: "reintentable", motivo: "Sin conexión", servidor: false };
  }
}

export interface OpcionesEnviarOEncolar {
  almacen: AlmacenEnvios | null;
  transporte: Transporte;
  /** false = el aparato sabe que no hay red: ni se intenta, directo a la cola. */
  enLinea?: boolean;
  ahora?: number;
}

/**
 * Manda el envío ya, y si no se puede por falta de red lo guarda para después. Un rechazo
 * del servidor (datos inválidos, sin permiso, cantidad de más) NO se encola: se devuelve
 * para que la persona lo corrija.
 */
export async function enviarOEncolar(
  datos: NuevoEnvio,
  { almacen, transporte, enLinea = true, ahora = Date.now() }: OpcionesEnviarOEncolar
): Promise<ResultadoEnvio> {
  const envio = crearEnvio(datos, ahora);
  if (enLinea) {
    const r = await intentar(envio, transporte);
    if (r.tipo === "ok") return { estado: "enviado" };
    if (r.tipo === "rechazado") return { estado: "rechazado", mensaje: r.mensaje };
    envio.intentos = 1;
    envio.proximoIntento = ahora + esperaTras(1);
    envio.error = r.motivo;
  } else {
    envio.error = "Sin conexión";
  }
  if (!almacen) {
    // Sin dónde guardarlo (navegador sin IndexedDB, modo privado): no se pierde en silencio.
    return { estado: "rechazado", mensaje: "No hay conexión y este navegador no puede guardar el envío. Inténtalo de nuevo cuando vuelva la red." };
  }
  try {
    await almacen.agregar(envio);
  } catch {
    return { estado: "rechazado", mensaje: "No hay conexión y no se pudo guardar el envío en este aparato (¿poco espacio?). Inténtalo de nuevo cuando vuelva la red." };
  }
  return { estado: "en-cola" };
}

export interface ResumenProceso {
  enviados: Envio[];
  rechazados: Envio[];
  /** Quedan pendientes (reintento más adelante o aún no toca). */
  pendientes: number;
}

export interface OpcionesProcesar {
  almacen: AlmacenEnvios;
  transporte: Transporte;
  /** Solo se mandan los envíos de esta persona. */
  usuarioId: string;
  ahora?: number;
  /** true = ignorar la espera (botón "Enviar ahora"). */
  forzar?: boolean;
}

/**
 * Manda, en orden y de uno en uno, los envíos pendientes de la persona. Si uno falla por
 * red se detiene (los demás fallarían igual y se conserva el orden); si el servidor
 * rechaza uno, queda marcado y se sigue con el siguiente.
 */
export async function procesarCola({
  almacen,
  transporte,
  usuarioId,
  ahora = Date.now(),
  forzar = false,
}: OpcionesProcesar): Promise<ResumenProceso> {
  const todos = (await almacen.listar()).sort((a, b) => a.creadoEn - b.creadoEn);
  const mios = todos.filter((e) => e.usuarioId === usuarioId && e.estado === "pendiente");
  const resumen: ResumenProceso = { enviados: [], rechazados: [], pendientes: 0 };

  let detenido = false;
  for (const envio of mios) {
    if (detenido || (!forzar && envio.proximoIntento > ahora)) {
      resumen.pendientes++;
      continue;
    }
    const r = await intentar(envio, transporte);
    if (r.tipo === "ok") {
      await almacen.quitar(envio.id);
      resumen.enviados.push(envio);
    } else if (r.tipo === "rechazado") {
      const rechazado: Envio = { ...envio, estado: "rechazado", error: r.mensaje, intentos: envio.intentos + 1 };
      await almacen.actualizar(rechazado);
      resumen.rechazados.push(rechazado);
    } else {
      const intentos = envio.intentos + 1;
      if (r.servidor && intentos >= MAX_INTENTOS_SERVIDOR) {
        const rechazado: Envio = { ...envio, estado: "rechazado", intentos, error: `${r.motivo} (el servidor falló ${intentos} veces)` };
        await almacen.actualizar(rechazado);
        resumen.rechazados.push(rechazado);
      } else {
        await almacen.actualizar({ ...envio, intentos, proximoIntento: ahora + esperaTras(intentos), error: r.motivo });
        resumen.pendientes++;
        detenido = true;
      }
    }
  }
  return resumen;
}

/** Envíos de la persona que siguen sin mandarse, para mostrar en pantalla. */
export async function enviosDe(almacen: AlmacenEnvios, usuarioId: string): Promise<Envio[]> {
  return (await almacen.listar())
    .filter((e) => e.usuarioId === usuarioId)
    .sort((a, b) => a.creadoEn - b.creadoEn);
}

/** Cantidad en cola (sin rechazados) para un grupo, p. ej. una asignación. */
export function cantidadEnCola(envios: Envio[], grupo: string): number {
  return envios
    .filter((e) => e.grupo === grupo && e.estado === "pendiente")
    .reduce((suma, e) => suma + (e.cantidad ?? 0), 0);
}

export function crearAlmacenMemoria(): AlmacenEnvios {
  const mapa = new Map<string, Envio>();
  return {
    async agregar(e) {
      mapa.set(e.id, e);
    },
    async listar() {
      return [...mapa.values()].map((e) => ({ ...e }));
    },
    async actualizar(e) {
      if (mapa.has(e.id)) mapa.set(e.id, e);
    },
    async quitar(id) {
      mapa.delete(id);
    },
  };
}
