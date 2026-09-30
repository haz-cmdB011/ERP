"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import IconoPapelera from "@/components/icono-papelera";
import { eliminarReciboDefinitivo, type TipoCualquierRecibo } from "@/lib/estimaciones/revision-db";

// Elimina el recibo de la base de datos para siempre. Solo se muestra al
// desarrollador; la base además lo exige (eliminar_recibo_definitivo).
export default function EliminarReciboDefinitivoBoton({
  tipo,
  reciboId,
  folio,
  variante = "texto",
}: {
  tipo: TipoCualquierRecibo;
  reciboId: string;
  folio: string;
  // "icono": papelera compacta para las filas del registro; "texto": botón con
  // etiqueta para la ficha del recibo.
  variante?: "texto" | "icono";
}) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function eliminar() {
    if (
      !window.confirm(
        `¿Eliminar DEFINITIVAMENTE el recibo ${folio}? Se borra de la base de datos junto con sus renglones y no se puede deshacer.`
      )
    ) {
      return;
    }
    setTrabajando(true);
    setError(null);
    const { error } = await eliminarReciboDefinitivo(createClient(), tipo, reciboId);
    if (error) {
      setTrabajando(false);
      setError(error);
      return;
    }
    // Desde el registro se queda en la misma vista (con su filtro); desde la
    // ficha, que ya no existe, vuelve al registro.
    if (variante !== "icono") router.push("/estimaciones/registro");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      {variante === "icono" ? (
        <button
          type="button"
          onClick={() => void eliminar()}
          disabled={trabajando}
          title="Eliminar recibo definitivamente"
          aria-label={`Eliminar el recibo ${folio} definitivamente`}
          className="flex h-7 w-7 items-center justify-center rounded border border-rose-200 bg-rose-50 text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
        >
          {trabajando ? "…" : <IconoPapelera />}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void eliminar()}
          disabled={trabajando}
          className="rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          {trabajando ? "Eliminando…" : "Eliminar recibo"}
        </button>
      )}
      {error && <span className="max-w-[14rem] text-right text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
