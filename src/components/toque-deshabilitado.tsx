"use client";

import { useEffect } from "react";
import { avisar } from "@/components/avisos";
import { respuestaToqueDeshabilitado } from "@/lib/ui/toque-deshabilitado";

// Con el dedo, tocar un botón deshabilitado no hacía nada y no decía por qué (con ratón el motivo sale
// al señalarlo). Aquí, al tocarlo: si es el de enviar y falta un campo obligatorio, el navegador lo marca
// y lo enfoca; si el botón trae su motivo (title, aria-description o data-motivo), sale como aviso.
// El navegador sí entrega pointerup en un botón deshabilitado aunque no mande el clic. Con ratón no hace
// nada: ahí está el title.
export default function ToqueDeshabilitado() {
  useEffect(() => {
    let ultimo: { boton: Element; en: number } | null = null;

    function alSoltar(e: PointerEvent) {
      if (e.pointerType === "mouse") return;
      const destino = e.target instanceof Element ? e.target : null;
      const boton = destino?.closest('button:disabled, [role="button"][aria-disabled="true"], button[aria-disabled="true"]');
      if (!boton) return;
      // Un mismo botón no repite el aviso si se toca varias veces seguidas.
      const ahora = Date.now();
      if (ultimo && ultimo.boton === boton && ahora - ultimo.en < 2000) return;
      ultimo = { boton, en: ahora };

      const form = boton instanceof HTMLButtonElement ? boton.form : null;
      const esEnvio = boton instanceof HTMLButtonElement && boton.type === "submit" && form !== null;
      const respuesta = respuestaToqueDeshabilitado({
        esEnvio,
        formularioValido: form ? form.checkValidity() : null,
        motivo:
          boton.getAttribute("title") ?? boton.getAttribute("aria-description") ?? boton.getAttribute("data-motivo"),
      });
      if (respuesta === "validar" && form) {
        // El navegador enfoca el campo y pone su globo; el aviso dice cuál es, por si el globo no se ve.
        const campo = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input:invalid, select:invalid, textarea:invalid"
        );
        form.reportValidity();
        const nombre =
          campo?.labels?.[0]?.innerText.split("\n")[0].trim() ||
          campo?.getAttribute("aria-label") ||
          (campo && "placeholder" in campo ? campo.placeholder : "");
        avisar(nombre ? `Falta llenar: ${nombre}.` : "Falta llenar un campo.", "info");
      } else if (respuesta && respuesta !== "validar") {
        avisar(respuesta.aviso, "info");
      }
    }

    document.addEventListener("pointerup", alSoltar, true);
    return () => document.removeEventListener("pointerup", alSoltar, true);
  }, []);

  return null;
}
