"use client";

import { useEffect } from "react";
import { SALIDA_MS } from "@/lib/ui/use-presencia";

// Diálogos y visores que su pantalla quita de golpe (`{abierto && <Modal/>}`):
// al desaparecer del documento se pone en su lugar una copia inmóvil que se
// desvanece con la animación de salida de globals.css ([data-saliendo]) y se
// borra sola. Así cualquier ventana se va con suavidad sin tocar cada pantalla.
// Los que ya usan usePresencia llegan aquí con data-saliendo y se ignoran.
//
// La copia va directo en <body> (no en el contenedor de React, que no debe
// encontrarse nodos ajenos) y es inerte: no recibe foco, clics ni lectores de
// pantalla. Sin efecto con "reducir movimiento".
const SELECTOR = ".fixed.inset-0:is(.z-50, .z-\\[100\\])";

export default function SalidasSuaves() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observador = new MutationObserver((cambios) => {
      for (const cambio of cambios) {
        cambio.removedNodes.forEach((nodo) => {
          if (!(nodo instanceof HTMLElement)) return;
          const capa = nodo.matches(SELECTOR) ? nodo : nodo.querySelector<HTMLElement>(SELECTOR);
          if (!capa || capa.hasAttribute("data-saliendo") || capa.hasAttribute("data-copia-salida")) return;
          const copia = capa.cloneNode(true) as HTMLElement;
          copia.setAttribute("data-saliendo", "");
          copia.setAttribute("data-copia-salida", "");
          copia.setAttribute("aria-hidden", "true");
          copia.inert = true;
          copia.removeAttribute("id");
          copia.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
          document.body.appendChild(copia);
          setTimeout(() => copia.remove(), SALIDA_MS + 40);
        });
      }
    });
    observador.observe(document.body, { childList: true, subtree: true });
    return () => observador.disconnect();
  }, []);

  return null;
}
