"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type jsQRTipo from "jsqr";
import { itemDeQrViajero } from "@/lib/produccion/qr-viajero";
import { RUTAS_ESCANER, type AreaEscaner } from "@/lib/produccion/escaner-rutas";

type Estado = "iniciando" | "escaneando" | "sin-permiso" | "sin-camara" | "no-soportado";
type Lector = typeof jsQRTipo;

// El video se reduce a este lado máximo antes de buscar el QR: es mucho más
// rápido y el código de una hoja impresa sigue siendo legible. Las fotos
// sacadas con el selector de archivos se reducen menos.
const LADO_VIDEO = 640;
const LADO_FOTO = 1400;
const INTERVALO_MS = 150;

function leerQr(
  lector: Lector,
  fuente: CanvasImageSource,
  ancho: number,
  alto: number,
  canvas: HTMLCanvasElement,
  ladoMax: number,
  intentos: "dontInvert" | "attemptBoth"
): string | null {
  if (!ancho || !alto) return null;
  const escala = Math.min(1, ladoMax / Math.max(ancho, alto));
  const w = Math.max(1, Math.round(ancho * escala));
  const h = Math.max(1, Math.round(alto * escala));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(fuente, 0, 0, w, h);
  const datos = ctx.getImageData(0, 0, w, h);
  return lector(datos.data, w, h, { inversionAttempts: intentos })?.data ?? null;
}

const ESTILO_BOTON_SECUNDARIO =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50";

// Escáner del QR de la Hoja de Viajero con la cámara del celular. Al leer uno
// abre la pantalla del mueble en el área que lo usa (`rutaItem`): Producción
// para registrar su entrega, Calidad para evaluarlo. Si la cámara no está
// disponible (sin permiso, navegador sin soporte), se puede tomar una foto del
// QR o escribir el folio (`rutaFolio` dice a dónde se busca).
export default function EscanerQr({ area }: { area: AreaEscaner }) {
  // Se recibe solo el nombre del área: una página de servidor no puede pasar funciones
  // a un componente de cliente (Next lo rechaza al pintar la pantalla).
  const { item: rutaItem, folio: rutaFolio, placeholderFolio } = RUTAS_ESCANER[area];
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [estado, setEstado] = useState<Estado>("iniciando");
  const [aviso, setAviso] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [folio, setFolio] = useState("");
  const [leyendoFoto, setLeyendoFoto] = useState(false);

  // Abre la pantalla del mueble si el texto leído es un QR de viajero.
  const abrirItem = useCallback(
    (texto: string): boolean => {
      const item = itemDeQrViajero(texto);
      if (!item) return false;
      navigator.vibrate?.(80);
      router.push(rutaItem(item.itemId));
      return true;
    },
    [router, rutaItem]
  );

  useEffect(() => {
    let terminado = false;
    let flujo: MediaStream | null = null;
    let cuadro = 0;

    async function iniciar() {
      try {
        // Sin mediaDevices (página sin https, navegador viejo) esto lanza un
        // TypeError que cae en el catch como "no soportado".
        const [lector, camara] = await Promise.all([
          import("jsqr").then((m) => m.default),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          }),
        ]);
        if (terminado) {
          camara.getTracks().forEach((t) => t.stop());
          return;
        }
        flujo = camara;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = camara;
        await video.play();
        setEstado("escaneando");

        let ultimo = 0;
        let ultimoNoValido = "";
        const paso = (t: number) => {
          if (terminado) return;
          cuadro = requestAnimationFrame(paso);
          const canvas = canvasRef.current;
          if (t - ultimo < INTERVALO_MS || video.readyState < 2 || !canvas) return;
          ultimo = t;
          const texto = leerQr(lector, video, video.videoWidth, video.videoHeight, canvas, LADO_VIDEO, "dontInvert");
          if (!texto) return;
          if (abrirItem(texto)) {
            terminado = true;
          } else if (texto !== ultimoNoValido) {
            ultimoNoValido = texto;
            setAviso("Ese QR no es de una hoja de viajero. Busca el de la esquina de la hoja.");
          }
        };
        cuadro = requestAnimationFrame(paso);
      } catch (e) {
        if (terminado) return;
        if (!navigator.mediaDevices) setEstado("no-soportado");
        else {
          const nombre = e instanceof DOMException ? e.name : "";
          setEstado(nombre === "NotAllowedError" || nombre === "SecurityError" ? "sin-permiso" : "sin-camara");
        }
      }
    }

    void iniciar();
    return () => {
      terminado = true;
      cancelAnimationFrame(cuadro);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [abrirItem, intento]);

  function reintentar() {
    setAviso(null);
    setEstado("iniciando");
    setIntento((n) => n + 1);
  }

  // Alternativa sin cámara en vivo: una foto del QR (la cámara del sistema).
  async function leerFoto(archivo: File | undefined) {
    if (!archivo) return;
    setLeyendoFoto(true);
    setAviso(null);
    try {
      const [lector, imagen] = await Promise.all([
        import("jsqr").then((m) => m.default),
        createImageBitmap(archivo),
      ]);
      const canvas = canvasRef.current;
      const texto = canvas
        ? leerQr(lector, imagen, imagen.width, imagen.height, canvas, LADO_FOTO, "attemptBoth")
        : null;
      imagen.close();
      if (!texto) setAviso("No se encontró ningún QR en la foto. Acércate y que se vea completo.");
      else if (!abrirItem(texto)) setAviso("Ese QR no es de una hoja de viajero.");
    } catch {
      setAviso("No se pudo leer la foto. Intenta de nuevo.");
    } finally {
      setLeyendoFoto(false);
    }
  }

  function buscarFolio(e: React.FormEvent) {
    e.preventDefault();
    const texto = folio.trim();
    if (texto) router.push(rutaFolio(texto));
  }

  const conVideo = estado === "iniciando" || estado === "escaneando";
  const mensajeError: Record<Exclude<Estado, "iniciando" | "escaneando">, string> = {
    "sin-permiso":
      "No hay permiso para usar la cámara. Actívalo desde el candado de la barra del navegador y vuelve a intentar.",
    "sin-camara": "No se pudo abrir la cámara de este dispositivo.",
    "no-soportado":
      "Este navegador no puede abrir la cámara aquí (hace falta abrir la página con https).",
  };

  return (
    <div className="flex flex-col gap-5">
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {conVideo ? (
        <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
            aria-label="Vista de la cámara"
          />
          {/* Marco de guía: solo orienta, se lee todo el cuadro. */}
          <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          {estado === "iniciando" && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/90">
              Abriendo la cámara…
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900">
          <p>{mensajeError[estado]}</p>
          <button type="button" onClick={reintentar} className={ESTILO_BOTON_SECUNDARIO}>
            Intentar de nuevo
          </button>
        </div>
      )}

      <p role="status" aria-live="polite" className="min-h-5 text-center text-sm text-slate-600">
        {aviso ??
          (estado === "escaneando" ? "Apunta al QR de la hoja de viajero." : leyendoFoto ? "Leyendo la foto…" : "")}
      </p>

      <section aria-label="Otras formas" className="flex flex-col gap-3 border-t border-slate-200 pt-4">
        <h2 className="text-sm font-semibold text-slate-700">¿No lo lee?</h2>
        <label className={ESTILO_BOTON_SECUNDARIO}>
          {leyendoFoto ? "Leyendo la foto…" : "Tomar una foto del QR"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={leyendoFoto}
            className="sr-only"
            onChange={(e) => {
              void leerFoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <form onSubmit={buscarFolio} className="flex gap-2">
          <input
            type="search"
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
            placeholder={placeholderFolio}
            autoComplete="off"
            className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-slate-400 focus:outline-none sm:text-sm"
          />
          <button
            type="submit"
            disabled={!folio.trim()}
            className="min-h-11 shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400 disabled:opacity-50"
          >
            Buscar
          </button>
        </form>
      </section>
    </div>
  );
}
