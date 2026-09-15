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

  async function ejecutar(accion: Accion) {
    setConfirmando(null);
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
    <div className="flex items-center gap-2">
      {eliminado ? (
        <button
          onClick={() => setConfirmando("restaurar")}
          disabled={cargando !== null}
          className="text-xs text-blue-700 underline disabled:opacity-50"
        >
          {cargando === "restaurar" ? "Restaurando..." : "Restaurar"}
        </button>
      ) : (
        <button
          onClick={() => setConfirmando("logico")}
          disabled={cargando !== null}
          className="text-xs text-amber-700 underline disabled:opacity-50"
        >
          {cargando === "logico" ? "Eliminando..." : "Eliminar"}
        </button>
      )}
      <button
        onClick={() => setConfirmando("definitivo")}
        disabled={cargando !== null}
        className="text-xs text-red-700 underline disabled:opacity-50"
      >
        {cargando === "definitivo" ? "Eliminando..." : "Eliminar definitivo"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
