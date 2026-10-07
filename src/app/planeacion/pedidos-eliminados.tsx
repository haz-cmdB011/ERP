"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { avisar } from "@/components/avisos";
import AccionesPedido from "./acciones-pedido";
import type { ResultadoEliminacion } from "@/app/api/planeacion/pedidos/eliminar-definitivo/route";

export interface PedidoEliminado {
  id: string;
  numero_pedido: string;
  proyecto: string;
  cliente: string;
  eliminado_en: string;
}

// Tabla de "Pedidos eliminados" (papelera de Planeación) con selección múltiple:
// se marcan varios (o todos) y se borran definitivamente de una vez, con la
// contraseña de quien lo hace. Cada fila conserva Restaurar / Eliminar uno.
export default function PedidosEliminados({ pedidos }: { pedidos: PedidoEliminado[] }) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo cuentan los que siguen en la lista (tras recargar pueden haber desaparecido).
  const seleccion = useMemo(() => pedidos.filter((p) => marcados.has(p.id)), [pedidos, marcados]);
  const todos = pedidos.length > 0 && seleccion.length === pedidos.length;

  function alternar(id: string) {
    setMarcados((prev) => {
      const sig = new Set(prev);
      if (!sig.delete(id)) sig.add(id);
      return sig;
    });
  }

  async function eliminar(contrasena: string) {
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/planeacion/pedidos/eliminar-definitivo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: seleccion.map((p) => p.id), contrasena }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      resultados?: ResultadoEliminacion[];
    };
    setEnviando(false);

    if (!res.ok || !data.resultados) {
      // Contraseña incorrecta u otro rechazo previo: no se borró nada y se puede reintentar.
      setError(data.error ?? "No se pudo eliminar.");
      return;
    }

    const nombre = new Map(pedidos.map((p) => [p.id, p.numero_pedido]));
    const fallidos = data.resultados.filter((r) => !r.ok);
    const borrados = data.resultados.filter((r) => r.ok && !r.conservadoPorFolio).length;
    const conservados = data.resultados.filter((r) => r.ok && r.conservadoPorFolio).length;
    setConfirmando(false);
    setMarcados(new Set(fallidos.map((r) => r.id)));

    const partes = [
      borrados > 0 ? `${borrados} eliminado${borrados === 1 ? "" : "s"} definitivamente` : "",
      conservados > 0
        ? `${conservados} conservado${conservados === 1 ? "" : "s"} en Cancelados por sus folios de Calidad`
        : "",
    ].filter(Boolean);
    if (fallidos.length === 0) {
      avisar(`${partes.join("; ")}.`);
    } else {
      const detalle = fallidos
        .slice(0, 3)
        .map((r) => `${nombre.get(r.id) ?? r.id}: ${r.error}`)
        .join(" · ");
      avisar(
        `${partes.length ? `${partes.join("; ")}. ` : ""}No se pudieron eliminar ${fallidos.length}: ${detalle}${
          fallidos.length > 3 ? "…" : ""
        }`,
        "error"
      );
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={todos}
            onChange={() => setMarcados(todos ? new Set() : new Set(pedidos.map((p) => p.id)))}
            className="h-4 w-4"
          />
          Seleccionar todos ({pedidos.length})
        </label>
        <button
          type="button"
          disabled={seleccion.length === 0 || enviando}
          onClick={() => {
            setError(null);
            setConfirmando(true);
          }}
          className="rounded border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
        >
          Eliminar definitivamente ({seleccion.length})
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-10 px-4 py-3">
                <span className="sr-only">Seleccionar</span>
              </th>
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Proyecto</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Eliminado el</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pedidos.map((p) => (
              <tr key={p.id} className="align-top text-slate-500">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={marcados.has(p.id)}
                    onChange={() => alternar(p.id)}
                    aria-label={`Seleccionar el pedido ${p.numero_pedido}`}
                    className="h-4 w-4"
                  />
                </td>
                <td className="px-4 py-3 font-medium">{p.numero_pedido}</td>
                <td className="px-4 py-3">{p.proyecto}</td>
                <td className="px-4 py-3">{p.cliente}</td>
                <td className="px-4 py-3">{p.eliminado_en}</td>
                <td className="px-4 py-3">
                  <AccionesPedido pedidoId={p.id} numeroPedido={p.numero_pedido} eliminado={true} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmando}
        title={`Eliminar ${seleccion.length} pedido${seleccion.length === 1 ? "" : "s"} definitivamente`}
        message="Se borran con todo su historial e imágenes. No se puede deshacer. Los que tengan folios de Calidad se conservan en Cancelados."
        confirmLabel="Eliminar definitivamente"
        pedirContrasena
        error={error}
        busy={enviando}
        destructive
        onConfirm={(contrasena) => void eliminar(contrasena)}
        onCancel={() => setConfirmando(false)}
      />
    </div>
  );
}
