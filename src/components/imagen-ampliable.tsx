"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePresencia } from "@/lib/ui/use-presencia";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
const PASO_ZOOM = 1.25;

interface Vista {
  escala: number;
  x: number;
  y: number;
}

const VISTA_INICIAL: Vista = { escala: 1, x: 0, y: 0 };

function acotar(escala: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, escala));
}

// Miniatura que, al hacer clic o tocarla, se abre en grande sobre la página con zoom:
// rueda del mouse para acercar/alejar (hacia donde apunta el cursor), arrastrar
// para mover, doble clic para acercar/restablecer, y botones +, − y restablecer. Con el dedo:
// pellizcar para acercar y doble toque para acercar/restablecer.
// Es solo para verla (sin acciones): se cierra con la ×, con clic fuera de la
// imagen o con Escape. Los clics no se propagan a la fila/tarjeta que la
// contiene, para no disparar sus propias acciones (p. ej. desplegar un mueble).
//
// `urlGrande` es la versión de mayor resolución (si existe); si falta o no
// carga, se usa la miniatura.
export default function ImagenAmpliable({
  url,
  urlGrande = null,
  alt = "",
  className = "h-10 w-10",
  ajuste = "cover",
}: {
  url: string;
  urlGrande?: string | null;
  alt?: string;
  className?: string;
  // Cómo se acomoda la miniatura en su caja: "cover" la llena recortando lo que sobra (por omisión);
  // "contain" la muestra completa, sin recortar.
  ajuste?: "cover" | "contain";
}) {
  const [abierta, setAbierta] = useState(false);
  const { montado, saliendo } = usePresencia(abierta);
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL);
  const [arrastrando, setArrastrando] = useState(false);
  const [grandeFalla, setGrandeFalla] = useState(false);
  const contenedor = useRef<HTMLDivElement | null>(null);
  const arrastre = useRef<{ px: number; py: number; x: number; y: number; movio: boolean } | null>(
    null
  );
  // Con el dedo: los dedos que tocan la imagen (para pellizcar con dos), el pellizco en curso y el
  // último toque (para reconocer el doble toque, que en iOS no siempre llega como doble clic).
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const pellizco = useRef<{ distancia: number; cx: number; cy: number; inicio: Vista } | null>(null);
  const ultimoToque = useRef<{ t: number; x: number; y: number } | null>(null);
  const tocoConDedo = useRef(false);
  // El gesto actual tuvo pellizco: al levantar el último dedo no cuenta como toque.
  const huboPellizco = useRef(false);

  const cerrar = useCallback(() => {
    setAbierta(false);
    setVista(VISTA_INICIAL);
    setArrastrando(false);
  }, []);

  // Acerca/aleja manteniendo fijo el punto bajo `(cx, cy)`, medido desde el
  // centro de la pantalla (la imagen escala desde su centro).
  const hacerZoom = useCallback((factor: number, cx = 0, cy = 0) => {
    setVista((v) => {
      const escala = acotar(v.escala * factor);
      const k = escala / v.escala;
      return { escala, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  useEffect(() => {
    if (!abierta) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
      else if (e.key === "+" || e.key === "=") hacerZoom(PASO_ZOOM);
      else if (e.key === "-") hacerZoom(1 / PASO_ZOOM);
      else if (e.key === "0") setVista(VISTA_INICIAL);
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [abierta, cerrar, hacerZoom]);

  // La rueda se registra a mano (no con onWheel de React) porque hay que
  // poder cancelar el scroll de la página de fondo, y React la registra pasiva.
  useEffect(() => {
    const el = contenedor.current;
    if (!abierta || !el) return;
    const alRodar = (e: WheelEvent) => {
      e.preventDefault();
      const caja = el.getBoundingClientRect();
      const cx = e.clientX - caja.left - caja.width / 2;
      const cy = e.clientY - caja.top - caja.height / 2;
      hacerZoom(e.deltaY < 0 ? PASO_ZOOM : 1 / PASO_ZOOM, cx, cy);
    };
    el.addEventListener("wheel", alRodar, { passive: false });
    return () => el.removeEventListener("wheel", alRodar);
  }, [abierta, hacerZoom]);

  // Punto de la pantalla medido desde el centro del visor (de ahí escala la imagen).
  function desdeCentro(x: number, y: number) {
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja) return { cx: 0, cy: 0 };
    return { cx: x - caja.left - caja.width / 2, cy: y - caja.top - caja.height / 2 };
  }

  // Acerca al triple donde se tocó dos veces (o donde se hizo doble clic); si ya está acercada, la
  // regresa a su tamaño.
  function alternarZoom(x: number, y: number) {
    if (vista.escala > 1.05) {
      setVista(VISTA_INICIAL);
      return;
    }
    const { cx, cy } = desdeCentro(x, y);
    hacerZoom(3, cx, cy);
  }

  function empezarArrastre(x: number, y: number, desde: Vista) {
    arrastre.current = { px: x, py: y, x: desde.x, y: desde.y, movio: false };
    setArrastrando(true);
  }

  function alPresionarImagen(e: React.PointerEvent<HTMLImageElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    tocoConDedo.current = e.pointerType === "touch";
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.current.size === 2) {
      // Segundo dedo: deja de mover y empieza a pellizcar desde el punto medio entre los dos.
      const [a, b] = [...dedos.current.values()];
      const { cx, cy } = desdeCentro((a.x + b.x) / 2, (a.y + b.y) / 2);
      pellizco.current = { distancia: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx, cy, inicio: vista };
      huboPellizco.current = true;
      arrastre.current = null;
      return;
    }
    if (dedos.current.size === 1) empezarArrastre(e.clientX, e.clientY, vista);
  }

  function alMoverImagen(e: React.PointerEvent<HTMLImageElement>) {
    if (!dedos.current.has(e.pointerId)) return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pellizco.current;
    if (p && dedos.current.size >= 2) {
      const [a, b] = [...dedos.current.values()];
      const escala = acotar(p.inicio.escala * (Math.hypot(a.x - b.x, a.y - b.y) / p.distancia));
      const k = escala / p.inicio.escala;
      // El punto medio de los dedos se queda bajo los dedos, y se mueve con ellos.
      const { cx, cy } = desdeCentro((a.x + b.x) / 2, (a.y + b.y) / 2);
      setVista({ escala, x: cx - (p.cx - p.inicio.x) * k, y: cy - (p.cy - p.inicio.y) * k });
      return;
    }
    const d = arrastre.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.movio = true;
    setVista((v) => ({ ...v, x: d.x + dx, y: d.y + dy }));
  }

  function alSoltarImagen(e: React.PointerEvent<HTMLImageElement>) {
    e.stopPropagation();
    dedos.current.delete(e.pointerId);
    const pellizcando = huboPellizco.current;
    if (pellizco.current && dedos.current.size < 2) {
      pellizco.current = null;
      // Queda un dedo: sigue moviendo desde donde está, sin brincar.
      const [resto] = [...dedos.current.values()];
      if (resto) {
        empezarArrastre(resto.x, resto.y, vista);
        return;
      }
    }
    const movio = arrastre.current?.movio ?? false;
    arrastre.current = null;
    setArrastrando(false);
    if (dedos.current.size === 0) huboPellizco.current = false;
    if (pellizcando) ultimoToque.current = null;
    // Doble toque con el dedo: dos toques cortos, seguidos y en el mismo lugar.
    if (e.pointerType === "touch" && e.type === "pointerup" && !movio && !pellizcando) {
      const ahora = Date.now();
      const u = ultimoToque.current;
      if (u && ahora - u.t < 320 && Math.hypot(e.clientX - u.x, e.clientY - u.y) < 30) {
        ultimoToque.current = null;
        alternarZoom(e.clientX, e.clientY);
      } else {
        ultimoToque.current = { t: ahora, x: e.clientX, y: e.clientY };
      }
    }
  }

  function alDobleClicImagen(e: React.MouseEvent<HTMLImageElement>) {
    e.stopPropagation();
    // Con el dedo ya lo resolvió alSoltarImagen: si el navegador también manda el doble clic, se
    // acercaría y se alejaría en el mismo gesto.
    if (tocoConDedo.current) return;
    alternarZoom(e.clientX, e.clientY);
  }

  const fuente = urlGrande && !grandeFalla ? urlGrande : url;
  const botonControl =
    "flex h-9 min-w-9 items-center justify-center rounded bg-white/90 px-2 text-lg font-semibold text-slate-800 shadow hover:bg-white pointer-coarse:h-11 pointer-coarse:min-w-11";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierta(true);
        }}
        title="Clic para ampliar"
        aria-label="Ampliar imagen"
        className={`block shrink-0 cursor-zoom-in overflow-hidden rounded border border-slate-200 bg-papel transition hover:border-slate-400 hover:shadow ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen en bucket privado vía signed URL, no next/image */}
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`h-full w-full ${ajuste === "contain" ? "object-contain" : "object-cover"}`}
        />
      </button>

      {montado && (
        <div
          ref={contenedor}
          data-saliendo={saliendo || undefined}
          role="dialog"
          aria-modal="true"
          aria-label="Imagen ampliada"
          onClick={(e) => {
            e.stopPropagation();
            cerrar();
          }}
          className="fixed inset-0 z-[100] flex touch-none select-none items-center justify-center overflow-hidden bg-scrim/85 p-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen en bucket privado vía signed URL, no next/image */}
          <img
            src={fuente}
            alt={alt}
            draggable={false}
            onError={() => setGrandeFalla(true)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={alDobleClicImagen}
            onPointerDown={alPresionarImagen}
            onPointerMove={alMoverImagen}
            onPointerUp={alSoltarImagen}
            onPointerCancel={alSoltarImagen}
            // Ocupa casi toda la pantalla al 100% (se escala hacia arriba si la
            // original es pequeña) sin deformarse; el zoom parte de ahí.
            className={`h-[94vh] w-[96vw] rounded-lg bg-papel object-contain shadow-2xl ${
              arrastrando ? "cursor-grabbing" : "cursor-grab"
            }`}
            style={{
              transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.escala})`,
              transition: arrastrando ? "none" : "transform 80ms ease-out",
            }}
          />

          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-4 top-4 flex items-center gap-2"
          >
            <button
              type="button"
              onClick={() => hacerZoom(1 / PASO_ZOOM)}
              aria-label="Alejar"
              title="Alejar (−)"
              className={botonControl}
            >
              −
            </button>
            <span className="min-w-12 rounded bg-scrim/50 px-2 py-1 text-center text-xs font-medium text-on-scrim">
              {Math.round(vista.escala * 100)}%
            </span>
            <button
              type="button"
              onClick={() => hacerZoom(PASO_ZOOM)}
              aria-label="Acercar"
              title="Acercar (+)"
              className={botonControl}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setVista(VISTA_INICIAL)}
              aria-label="Restablecer"
              title="Restablecer (0)"
              className={`${botonControl} text-sm`}
            >
              Ajustar
            </button>
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar"
              title="Cerrar (Esc)"
              className={botonControl}
            >
              ×
            </button>
          </div>

          <p className="pointer-events-none absolute bottom-4 left-1/2 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded bg-scrim/55 px-3 py-1 text-center text-xs text-on-scrim/90">
            <span className="pointer-coarse:hidden">Rueda del mouse: zoom · Arrastra: mover · Doble clic: acercar · Esc: cerrar</span>
            <span className="hidden pointer-coarse:inline">Pellizca o toca dos veces para acercar · Arrastra para mover</span>
          </p>
        </div>
      )}
    </>
  );
}
