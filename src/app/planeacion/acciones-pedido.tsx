"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import IconoPapelera from "@/components/icono-papelera";
import ConfirmDialog from "@/components/confirm-dialog";
import { avisar } from "@/components/avisos";

type Accion = "logico" | "definitivo" | "restaurar";

async function llamar(pedidoId: string, accion: Accion): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res =
    accion === "definitivo"
      ? await fetch(`/api/planeacion/pedidos/${pedidoId}`, { method: "DELETE" })
      : await fetch(`/api/planeacion/pedidos/${pedidoId}/${accion === "logico" ? "eliminar-logico" : "restaurar"}`, {
          method: "POST",
        });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// Eliminar un PM en dos pasos, para que lo irreversible quede lejos del clic
// por error:
//  - En la lista (eliminado = false) solo está la papelera. Pide confirmar y el
//    aviso trae "Deshacer".
//  - En "Pedidos eliminados" (eliminado = true) se puede restaurar o eliminar
//    definitivamente; esto último exige escribir el número del PM.
export default function AccionesPedido({
  pedidoId,
  eliminado,
  numeroPedido,
}: {
  pedidoId: string;
  eliminado: boolean;
  // Para nombrarlo en los mensajes y como texto a escribir al eliminar definitivo.
  numeroPedido?: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<Accion | null>(null);
  const [cargando, setCargando] = useState<Accion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nombre = numeroPedido ? `el pedido ${numeroPedido}` : "este pedido";

  // Deshacer desde el aviso: la acción contraria (papelera <-> restaurar).
  async function deshacer(accion: Accion) {
    const { ok, data } = await llamar(pedidoId, accion);
    if (!ok) {
      avisar(String(data.error ?? "No se pudo deshacer."), "error");
      return;
    }
    avisar("Cambio deshecho.", "info");
    router.refresh();
  }

  async function ejecutar(accion: Accion) {
    setConfirmando(null);
    setCargando(accion);
    setError(null);
    const { ok, data } = await llamar(pedidoId, accion);
    setCargando(null);

    if (!ok) {
      setError(String(data.error ?? "Error desconocido."));
      return;
    }
    // eliminar_pedido_definitivo no borra un pedido que ya tiene folio(s)
    // de Calidad — lo deja cancelado en vez de eliminarlo (ver Cancelados).
    // La fila desaparece de la lista, así que el resultado va en un aviso.
    if (accion === "definitivo") {
      avisar(
        data.conservadoPorFolio
          ? "Eliminado. Como tenía folio(s) de Calidad, su historial se conserva en Cancelados."
          : "Pedido eliminado definitivamente."
      );
    } else if (accion === "logico") {
      avisar("Pedido enviado a la papelera.", "exito", {
        etiqueta: "Deshacer",
        alHacer: () => deshacer("restaurar"),
      });
    } else {
      avisar("Pedido restaurado.", "exito", {
        etiqueta: "Deshacer",
        alHacer: () => deshacer("logico"),
      });
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {eliminado ? (
          <>
            <button
              onClick={() => void ejecutar("restaurar")}
              disabled={cargando !== null}
              className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50"
            >
              {cargando === "restaurar" ? "Restaurando..." : "Restaurar"}
            </button>
            <button
              onClick={() => setConfirmando("definitivo")}
              disabled={cargando !== null}
              className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
            >
              {cargando === "definitivo" ? "Eliminando..." : "Eliminar definitivamente"}
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmando("logico")}
            disabled={cargando !== null}
            title="Enviar a la papelera"
            aria-label={`Enviar ${nombre} a la papelera`}
            className="flex h-7 w-7 items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 pointer-coarse:h-11 pointer-coarse:w-11"
          >
            {cargando === "logico" ? "…" : <IconoPapelera />}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <ConfirmDialog
        open={confirmando === "logico"}
        title="Enviar a la papelera"
        message={`¿Enviar ${nombre} a la papelera? Se puede restaurar.`}
        confirmLabel="Enviar a la papelera"
        onConfirm={() => void ejecutar("logico")}
        onCancel={() => setConfirmando(null)}
      />
      <ConfirmDialog
        open={confirmando === "definitivo"}
        title="Eliminar definitivamente"
        message={`Se borra ${nombre} con todo su historial e imágenes. No se puede deshacer. Si tiene folios de Calidad, se conserva en Cancelados.`}
        confirmLabel="Eliminar definitivamente"
        confirmText={numeroPedido}
        destructive
        onConfirm={() => void ejecutar("definitivo")}
        onCancel={() => setConfirmando(null)}
      />
    </div>
  );
}
