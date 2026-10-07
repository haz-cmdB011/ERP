"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TipoAviso = "exito" | "error" | "info";

// Botón dentro del aviso (ej. "Deshacer"). Al pulsarlo se ejecuta y el aviso se cierra.
export interface AccionAviso {
  etiqueta: string;
  alHacer: () => void | Promise<void>;
}

interface Aviso {
  id: number;
  mensaje: string;
  tipo: TipoAviso;
  accion?: AccionAviso;
}

const EVENTO = "erp:aviso";
const MAX_VISIBLES = 4;
// Los errores se quedan más tiempo: hay que alcanzar a leerlos.
const DURACION_MS: Record<TipoAviso, number> = {
  exito: 4000,
  info: 5000,
  error: 9000,
};

// Muestra un aviso breve ("Recibo guardado ✓") en la esquina de la pantalla.
// Se puede llamar desde cualquier componente de cliente; sobrevive a
// router.refresh() y a la navegación porque <Avisos /> vive en el layout raíz
// (útil cuando la acción hace desaparecer el propio botón, como al eliminar
// una fila). Con `accion` el aviso lleva un botón y dura más para dar tiempo
// de pulsarlo.
export function avisar(mensaje: string, tipo: TipoAviso = "exito", accion?: AccionAviso) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<Omit<Aviso, "id">>(EVENTO, { detail: { mensaje, tipo, accion } }),
  );
}

const ESTILO: Record<
  TipoAviso,
  { borde: string; icono: string; ruta: React.ReactNode }
> = {
  exito: {
    borde: "border-l-emerald-500",
    icono: "text-emerald-600",
    ruta: <path d="m5 12 5 5L20 7" pathLength={1} className="anim-trazo" />,
  },
  error: {
    borde: "border-l-rose-500",
    icono: "text-rose-600",
    ruta: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </>
    ),
  },
  info: {
    borde: "border-l-sky-500",
    icono: "text-sky-600",
    ruta: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4M12 8h.01" />
      </>
    ),
  },
};

export default function Avisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguienteId = useRef(1);
  const temporizadores = useRef(
    new Map<number, ReturnType<typeof setTimeout>>(),
  );

  const cerrar = useCallback((id: number) => {
    clearTimeout(temporizadores.current.get(id));
    temporizadores.current.delete(id);
    setAvisos((lista) => lista.filter((a) => a.id !== id));
  }, []);

  const programarCierre = useCallback(
    (aviso: Aviso) => {
      clearTimeout(temporizadores.current.get(aviso.id));
      temporizadores.current.set(
        aviso.id,
        setTimeout(
          () => cerrar(aviso.id),
          aviso.accion ? Math.max(DURACION_MS[aviso.tipo], 8000) : DURACION_MS[aviso.tipo],
        ),
      );
    },
    [cerrar],
  );

  useEffect(() => {
    const mapa = temporizadores.current;
    function recibir(evento: Event) {
      const { mensaje, tipo, accion } = (evento as CustomEvent<Omit<Aviso, "id">>)
        .detail;
      const aviso = { id: siguienteId.current++, mensaje, tipo, accion };
      setAvisos((lista) => [...lista, aviso].slice(-MAX_VISIBLES));
      programarCierre(aviso);
    }
    window.addEventListener(EVENTO, recibir);
    return () => {
      window.removeEventListener(EVENTO, recibir);
      mapa.forEach(clearTimeout);
      mapa.clear();
    };
  }, [programarCierre]);

  return (
    // Abajo al centro en pantallas angostas (celular/tablet vertical), abajo a
    // la derecha en las anchas. Los avisos de error se anuncian de inmediato a
    // los lectores de pantalla; los demás, cuando terminan de hablar.
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end print:hidden"
    >
      {avisos.map((aviso) => {
        const estilo = ESTILO[aviso.tipo];
        return (
          <div
            key={aviso.id}
            role={aviso.tipo === "error" ? "alert" : "status"}
            onMouseEnter={() =>
              clearTimeout(temporizadores.current.get(aviso.id))
            }
            onMouseLeave={() => programarCierre(aviso)}
            className={`aviso-entrada pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-l-4 border-slate-200 bg-white p-3 text-sm text-slate-800 shadow-lg ${estilo.borde}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`mt-0.5 h-4 w-4 shrink-0 ${estilo.icono} ${
                aviso.tipo === "error" ? "anim-sacudir" : aviso.tipo === "info" ? "anim-rebote" : ""
              }`}
              aria-hidden="true"
            >
              {estilo.ruta}
            </svg>
            <p className="flex-1 break-words">{aviso.mensaje}</p>
            {aviso.accion && (
              <button
                type="button"
                onClick={() => {
                  cerrar(aviso.id);
                  void aviso.accion?.alHacer();
                }}
                className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50"
              >
                {aviso.accion.etiqueta}
              </button>
            )}
            <button
              type="button"
              onClick={() => cerrar(aviso.id)}
              className="-m-1 rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Cerrar aviso"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
