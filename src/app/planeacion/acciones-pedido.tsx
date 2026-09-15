"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AccionesPedido({
  pedidoId,
  eliminado,
}: {
  pedidoId: string;
  eliminado: boolean;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState<"logico" | "definitivo" | "restaurar" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function llamar(accion: "logico" | "definitivo" | "restaurar") {
    setCargando(accion);
    setError(null);

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
    router.refresh();
  }

  function confirmarYLlamar(accion: "logico" | "definitivo" | "restaurar", mensaje: string) {
    if (!confirm(mensaje)) return;
    void llamar(accion);
  }

  return (
    <div className="flex items-center gap-2">
      {eliminado ? (
        <button
          onClick={() =>
            confirmarYLlamar("restaurar", "¿Restaurar este pedido? Volverá a aparecer como activo.")
          }
          disabled={cargando !== null}
          className="text-xs text-blue-700 underline disabled:opacity-50"
        >
          {cargando === "restaurar" ? "Restaurando..." : "Restaurar"}
        </button>
      ) : (
        <button
          onClick={() =>
            confirmarYLlamar(
              "logico",
              "¿Marcar este pedido como eliminado? Se puede restaurar después."
            )
          }
          disabled={cargando !== null}
          className="text-xs text-amber-700 underline disabled:opacity-50"
        >
          {cargando === "logico" ? "Eliminando..." : "Eliminar"}
        </button>
      )}
      <button
        onClick={() =>
          confirmarYLlamar(
            "definitivo",
            "¿Eliminar DEFINITIVAMENTE este pedido? Se borrará junto con todo su historial de versiones, items e imágenes. Esta acción no se puede deshacer."
          )
        }
        disabled={cargando !== null}
        className="text-xs text-red-700 underline disabled:opacity-50"
      >
        {cargando === "definitivo" ? "Eliminando..." : "Eliminar definitivo"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
