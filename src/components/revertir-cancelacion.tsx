"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Botón con confirmación en línea (sin window.confirm, que puede quedar
// bloqueado según navegador/contexto). Se usa en los paneles Cancelados de
// Planeación, Producción y Calidad. El permiso real lo exigen la RLS y el RPC
// (is_planeacion()): quien no lo tiene ni ve el botón (ver `puedeRevertir`
// en cada página) y, si lo viera, la base rechazaría la acción.
function BotonConfirmado({
  etiqueta,
  pregunta,
  ejecutar,
}: {
  etiqueta: string;
  pregunta: string;
  ejecutar: () => Promise<string | null>;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    const mensaje = await ejecutar();
    setEnviando(false);
    if (mensaje) {
      setError(mensaje);
      return;
    }
    setConfirmando(false);
    router.refresh();
  }

  if (confirmando) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-gray-600">{pregunta}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={confirmar}
            disabled={enviando}
            className="text-xs font-medium text-blue-700 underline disabled:opacity-50"
          >
            {enviando ? "Revirtiendo..." : "Sí, revertir"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmando(false);
              setError(null);
            }}
            className="text-xs text-gray-500 underline"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirmando(true)}
      className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100"
    >
      {etiqueta}
    </button>
  );
}

// Reactiva el pedido y todos sus ítems cancelados (RPC reactivar_pedido, el
// inverso exacto de cancelar_pedido). Sirve tanto para un PM cancelado a mano
// como para uno "cancelado" porque todos sus ítems lo estaban.
export function RevertirPedidoBoton({
  pedidoId,
  etiqueta = "Revertir cancelación",
}: {
  pedidoId: string;
  etiqueta?: string;
}) {
  return (
    <BotonConfirmado
      etiqueta={etiqueta}
      pregunta="¿Revertir? El pedido y todos sus ítems cancelados volverán a estar activos."
      ejecutar={async () => {
        const supabase = createClient();
        const { error } = await supabase.rpc("reactivar_pedido", { p_pedido_id: pedidoId });
        return error ? error.message : null;
      }}
    />
  );
}

// Saca un ítem de la papelera (RPC cancelar_solicitud_eliminacion_item).
export function RestaurarItemBoton({ itemId }: { itemId: string }) {
  return (
    <BotonConfirmado
      etiqueta="Restaurar"
      pregunta="¿Restaurar este ítem? Volverá a la lista normal."
      ejecutar={async () => {
        const supabase = createClient();
        const { error } = await supabase.rpc("cancelar_solicitud_eliminacion_item", {
          p_item_id: itemId,
        });
        return error ? error.message : null;
      }}
    />
  );
}

// Restaura un PM eliminado (RPC restore_pedido): vuelve como pedido normal.
export function RestaurarPedidoBoton({ pedidoId }: { pedidoId: string }) {
  return (
    <BotonConfirmado
      etiqueta="Restaurar pedido"
      pregunta="¿Restaurar este pedido? Volverá a aparecer como pedido normal."
      ejecutar={async () => {
        const supabase = createClient();
        const { error } = await supabase.rpc("restore_pedido", { p_pedido_id: pedidoId });
        return error ? error.message : null;
      }}
    />
  );
}

// Regresa un solo ítem a "Normal" (limpia estado_revision y el motivo) por
// la misma ruta que usa el select de Planeación.
export function RevertirItemBoton({ itemId }: { itemId: string }) {
  return (
    <BotonConfirmado
      etiqueta="Revertir"
      pregunta="¿Revertir este ítem a Normal?"
      ejecutar={async () => {
        const res = await fetch(`/api/planeacion/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado_revision: null }),
        });
        const data = await res.json().catch(() => ({}));
        return res.ok ? null : (data.error ?? "Error desconocido.");
      }}
    />
  );
}
