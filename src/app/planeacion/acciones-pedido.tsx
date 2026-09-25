"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Accion = "logico" | "definitivo" | "restaurar";

const MENSAJES: Record<Accion, string> = {
  logico: "¿Marcar este pedido como eliminado? Se puede restaurar después.",
  definitivo:
    "¿Eliminar DEFINITIVAMENTE este pedido? Se borrará junto con todo su historial de versiones, items e imágenes. Esta acción no se puede deshacer.",
  restaurar: "¿Restaurar este pedido? Volverá a aparecer como activo.",
};

export default function AccionesPedido({
  pedidoId,
  eliminado,
}: {
  pedidoId: string;
  eliminado: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<Accion | null>(null);
  const [cargando, setCargando] = useState<Accion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function ejecutar(accion: Accion) {
    setConfirmando(null);
    setCargando(accion);
    setError(null);
    setAviso(null);

    const res =
      accion === "definitivo"
        ? await fetch(`/api/planeacion/pedidos/${pedidoId}`, { method: "DELETE" })
        : await fetch(
            `/api/planeacion/pedidos/${pedidoId}/${accion === "logico" ? "eliminar-logico" : "restaurar"}`,
            { method: "POST" }
          );

    const data = await res.json().catch(() => ({}));
    setCargando(null);

    if (!res.ok) {
      setError(data.error ?? "Error desconocido.");
      return;
    }
    // eliminar_pedido_definitivo no borra un pedido que ya tiene folio(s)
    // de Calidad — lo deja cancelado en vez de eliminarlo (ver Cancelados).
    if (accion === "definitivo" && data.conservadoPorFolio) {
      setAviso(
        "Este pedido ya tenía folio(s) de Calidad: se conservó como cancelado en vez de eliminarse. Puedes verlo en Cancelados."
      );
    }
    router.refresh();
  }

  // Confirmación dentro de la propia página en vez de window.confirm():
  // los diálogos nativos del navegador pueden quedar bloqueados según el
  // navegador/extensiones/contexto de vista, dejando el botón "sin efecto"
  // aparente al hacer clic.
  if (confirmando) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-gray-700">{MENSAJES[confirmando]}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => ejecutar(confirmando)}
            className="text-xs font-medium text-red-700 underline"
          >
            Sí, confirmar
          </button>
          <button
            onClick={() => setConfirmando(null)}
            className="text-xs text-gray-500 underline"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {eliminado ? (
          <button
            onClick={() => setConfirmando("restaurar")}
            disabled={cargando !== null}
            className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50"
          >
            {cargando === "restaurar" ? "Restaurando..." : "Restaurar"}
          </button>
        ) : (
          <button
            onClick={() => setConfirmando("logico")}
            disabled={cargando !== null}
            className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            {cargando === "logico" ? "Eliminando..." : "Eliminar"}
          </button>
        )}
        <button
          onClick={() => setConfirmando("definitivo")}
          disabled={cargando !== null}
          className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
        >
          {cargando === "definitivo" ? "Eliminando..." : "Eliminar definitivo"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {aviso && <p className="max-w-xs text-xs text-amber-700">{aviso}</p>}
    </div>
  );
}
