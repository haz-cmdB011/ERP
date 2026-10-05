"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { mensajeErrorRpc } from "@/lib/produccion/asignaciones";
import Modal, { estiloBotonSecundario, estiloCampo, estiloEtiqueta } from "./modal";

// Cancelar una asignación o anular una entrega: siempre con motivo, y queda
// en el historial (nada se borra).
const ACCIONES = {
  cancelar: {
    rpc: "cancelar_asignacion_produccion",
    param: "p_asignacion_id",
    boton: "Cancelar asignación",
    titulo: "Cancelar asignación",
    explicacion:
      "La asignación queda en el historial como cancelada y su cantidad vuelve a estar disponible para asignarse.",
    aviso: "Asignación cancelada",
  },
  anular: {
    rpc: "anular_entrega_produccion",
    param: "p_entrega_id",
    boton: "Anular",
    titulo: "Anular entrega",
    explicacion:
      "La entrega queda en el historial como anulada (con su foto) y deja de contar como entregada.",
    aviso: "Entrega anulada",
  },
} as const;

export default function AccionConMotivo({
  accion,
  id,
  descripcion,
}: {
  accion: keyof typeof ACCIONES;
  id: string;
  descripcion: string;
}) {
  const conf = ACCIONES[accion];
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await createClient().rpc(conf.rpc, { [conf.param]: id, p_motivo: motivo });
    setEnviando(false);
    if (error) {
      setError(mensajeErrorRpc(error.message));
      return;
    }
    setAbierto(false);
    avisar(conf.aviso);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMotivo("");
          setError(null);
          setAbierto(true);
        }}
        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
      >
        {conf.boton}
      </button>
      {abierto && (
        <Modal titulo={conf.titulo} subtitulo={descripcion} onCerrar={() => !enviando && setAbierto(false)}>
          <form onSubmit={confirmar} className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">{conf.explicacion}</p>
            <label className={estiloEtiqueta}>
              Motivo
              <textarea
                required
                rows={2}
                maxLength={300}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className={estiloCampo}
              />
            </label>
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={enviando}
                className={estiloBotonSecundario}
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={enviando || !motivo.trim()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {enviando ? "Guardando…" : conf.titulo}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
