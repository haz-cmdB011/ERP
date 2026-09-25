"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

// Miniatura que, al hacer clic, se abre en grande sobre la página con zoom:
// rueda del mouse para acercar/alejar (hacia donde apunta el cursor), arrastrar
// para mover, doble clic para acercar/restablecer, y botones +, − y restablecer.
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
}: {
  url: string;
  urlGrande?: string | null;
  alt?: string;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL);
  const [arrastrando, setArrastrando] = useState(false);
  const [grandeFalla, setGrandeFalla] = useState(false);
  const contenedor = useRef<HTMLDivElement | null>(null);
  const arrastre = useRef<{ px: number; py: number; x: number; y: number; movio: boolean } | null>(
    null
  );

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

  function alPresionarImagen(e: React.PointerEvent<HTMLImageElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { px: e.clientX, py: e.clientY, x: vista.x, y: vista.y, movio: false };
    setArrastrando(true);
  }

  function alMoverImagen(e: React.PointerEvent<HTMLImageElement>) {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.px;
    const dy = e.clientY - a.py;
    if (Math.abs(dx) + Math.abs(dy) > 3) a.movio = true;
    setVista((v) => ({ ...v, x: a.x + dx, y: a.y + dy }));
  }

  function alSoltarImagen(e: React.PointerEvent<HTMLImageElement>) {
    e.stopPropagation();
    arrastre.current = null;
    setArrastrando(false);
  }

  function alDobleClicImagen(e: React.MouseEvent<HTMLImageElement>) {
    e.stopPropagation();
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja) return;
    if (vista.escala > 1.05) {
      setVista(VISTA_INICIAL);
      return;
    }
    hacerZoom(3, e.clientX - caja.left - caja.width / 2, e.clientY - caja.top - caja.height / 2);
  }

  const fuente = urlGrande && !grandeFalla ? urlGrande : url;
  const botonControl =
    "flex h-9 min-w-9 items-center justify-center rounded bg-white/90 px-2 text-lg font-semibold text-slate-800 shadow hover:bg-white";

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
        className={`block shrink-0 cursor-zoom-in overflow-hidden rounded border border-slate-200 bg-white transition hover:border-slate-400 hover:shadow ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen en bucket privado vía signed URL, no next/image */}
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      </button>

      {abierta && (
        <div
          ref={contenedor}
          role="dialog"
          aria-modal="true"
          aria-label="Imagen ampliada"
          onClick={(e) => {
            e.stopPropagation();
            cerrar();
          }}
          className="fixed inset-0 z-[100] flex touch-none select-none items-center justify-center overflow-hidden bg-black/85 p-3"
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
            className={`h-[94vh] w-[96vw] rounded-lg bg-white object-contain shadow-2xl ${
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
            <span className="min-w-12 rounded bg-black/50 px-2 py-1 text-center text-xs font-medium text-white">
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

          <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/55 px-3 py-1 text-xs text-white/90">
            Rueda del mouse: zoom · Arrastra: mover · Doble clic: acercar · Esc: cerrar
          </p>
        </div>
      )}
    </>
  );
}
