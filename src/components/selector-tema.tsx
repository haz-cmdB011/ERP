"use client";

import { useSyncExternalStore } from "react";
import { CLAVE_TEMA, esTemaElegido, type Tema } from "@/lib/tema";

const EVENTO = "erp:tema";
const SIGUIENTE: Record<Tema, Tema> = { sistema: "claro", claro: "oscuro", oscuro: "sistema" };
const ETIQUETA: Record<Tema, string> = {
  sistema: "Tema: el del sistema",
  claro: "Tema: claro",
  oscuro: "Tema: oscuro",
};
const ACCION: Record<Tema, string> = {
  sistema: "usar el del sistema",
  claro: "cambiar a claro",
  oscuro: "cambiar a oscuro",
};

function leerTema(): Tema {
  const valor = document.documentElement.getAttribute("data-tema");
  return esTemaElegido(valor) ? valor : "sistema";
}

// Se actualiza al cambiar en esta pestaña (evento propio) o en otra (storage).
function suscribir(aviso: () => void) {
  function desdeOtraPestana(e: StorageEvent) {
    if (e.key !== CLAVE_TEMA) return;
    aplicar(esTemaElegido(e.newValue) ? e.newValue : "sistema", false);
  }
  window.addEventListener(EVENTO, aviso);
  window.addEventListener("storage", desdeOtraPestana);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener("storage", desdeOtraPestana);
  };
}

function aplicar(tema: Tema, guardar = true) {
  const raiz = document.documentElement;
  if (tema === "sistema") raiz.removeAttribute("data-tema");
  else raiz.setAttribute("data-tema", tema);
  if (guardar) {
    try {
      if (tema === "sistema") localStorage.removeItem(CLAVE_TEMA);
      else localStorage.setItem(CLAVE_TEMA, tema);
    } catch {
      // Sin localStorage el tema dura hasta recargar; no es grave.
    }
  }
  window.dispatchEvent(new Event(EVENTO));
}

function Icono({ tema }: { tema: Tema }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      {tema === "claro" ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : tema === "oscuro" ? (
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      ) : (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </>
      )}
    </svg>
  );
}

// Botón de la barra: alterna sistema → claro → oscuro. El ícono muestra el
// tema actual.
export default function SelectorTema() {
  // En el servidor no se sabe; se asume "sistema" y se corrige al hidratar.
  const tema = useSyncExternalStore(suscribir, leerTema, () => "sistema" as Tema);
  const siguiente = SIGUIENTE[tema];

  return (
    <button
      type="button"
      onClick={() => aplicar(siguiente)}
      title={`${ETIQUETA[tema]} (clic para ${ACCION[siguiente]})`}
      aria-label={`${ETIQUETA[tema]}. Clic para ${ACCION[siguiente]}`}
      className="inline-flex shrink-0 items-center rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:border-gray-300 hover:text-black"
    >
      <Icono tema={tema} />
    </button>
  );
}
