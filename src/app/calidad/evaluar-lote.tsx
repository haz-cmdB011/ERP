"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { CATEGORIAS_DEFECTO, type CategoriaDefecto } from "@/lib/calidad/categorias";
import { leerPiezas, validarEvaluacion, type LoteCalidad } from "@/lib/calidad/lotes";
import { PROCESO_LABELS, formatoFecha } from "@/lib/produccion/asignaciones";
import Modal, {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
  estiloEtiqueta,
} from "@/app/produccion/asignaciones/modal";

type LoteParaEvaluar = Pick<
  LoteCalidad,
  | "entrega_id"
  | "pedido_id"
  | "numero_pedido"
  | "item_code"
  | "modelo"
  | "unidad"
  | "proceso"
  | "equipo"
  | "fecha_entrega"
  | "cantidad"
  | "pendiente"
  | "folio_rechazo"
  | "folio_hoja"
>;

interface InformeCreado {
  informe_id: string;
  folio: string;
  aprobado: boolean;
}

// Calidad evalúa un lote (una entrega verificada por Producción): cuántas
// piezas aprueba y cuántas rechaza. Un folio por resultado; lo rechazado lleva
// motivo y vuelve a Producción como retrabajo.
export default function EvaluarLote({ lote, compacto = false }: { lote: LoteParaEvaluar; compacto?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [aprobadas, setAprobadas] = useState(String(lote.pendiente));
  const [rechazadas, setRechazadas] = useState("0");
  const [motivo, setMotivo] = useState("");
  const [categoria, setCategoria] = useState<CategoriaDefecto | "">("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unidad = lote.unidad ?? "pz";
  const nAprob = leerPiezas(aprobadas);
  const nRech = leerPiezas(rechazadas);
  const titulo = `${lote.numero_pedido} · ${lote.modelo ?? `ítem ${lote.item_code}`}`;

  function abrir() {
    setAprobadas(String(lote.pendiente));
    setRechazadas("0");
    setMotivo("");
    setCategoria("");
    setError(null);
    setAbierto(true);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const problema = validarEvaluacion(nAprob, nRech, lote.pendiente, motivo);
    if (problema) {
      setError(problema);
      return;
    }
    setEnviando(true);
    setError(null);
    const { data, error } = await createClient().rpc("evaluar_entrega_calidad", {
      p_entrega_id: lote.entrega_id,
      p_aprobadas: nAprob,
      p_rechazadas: nRech,
      p_motivo: nRech > 0 ? motivo.trim() : null,
      p_categoria: nRech > 0 && categoria ? categoria : null,
    });
    setEnviando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setAbierto(false);
    const creados = (data ?? []) as InformeCreado[];
    const folios = creados.map((c) => c.folio).join(" y ");
    const primero = creados[0];
    avisar(
      `${titulo}: ${folios || "evaluado"}.`,
      "exito",
      primero && lote.pedido_id
        ? {
            etiqueta: "Ver informe",
            alHacer: () => router.push(`/calidad/pedidos/${lote.pedido_id}/informe/${primero.informe_id}`),
          }
        : undefined
    );
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={`rounded-lg border border-brand-300 bg-brand-50 font-medium text-brand-800 transition-colors hover:bg-brand-100 max-md:min-h-11 ${
          compacto ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
        }`}
      >
        Evaluar {lote.pendiente} {unidad}
        {compacto ? ` · ${formatoFecha(lote.fecha_entrega)}` : ""}
      </button>
      {abierto && (
        <Modal
          titulo={`Evaluar lote · ${titulo}`}
          subtitulo={`${lote.equipo} · ${PROCESO_LABELS[lote.proceso]} · entregado el ${formatoFecha(lote.fecha_entrega)}${
            lote.folio_hoja ? ` · hoja ${lote.folio_hoja}` : ""
          }${lote.folio_rechazo ? ` · retrabajo de ${lote.folio_rechazo}` : ""}`}
          onCerrar={() => !enviando && setAbierto(false)}
        >
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Por evaluar: <strong>{lote.pendiente}</strong> de {lote.cantidad} {unidad}. Cada resultado genera su
              propio folio permanente.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className={estiloEtiqueta}>
                Aprobadas
                <input
                  inputMode="decimal"
                  value={aprobadas}
                  onChange={(e) => setAprobadas(e.target.value)}
                  className={estiloCampo}
                />
              </label>
              <label className={estiloEtiqueta}>
                Rechazadas
                <input
                  inputMode="decimal"
                  value={rechazadas}
                  onChange={(e) => setRechazadas(e.target.value)}
                  className={estiloCampo}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setAprobadas(String(lote.pendiente));
                  setRechazadas("0");
                }}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-700 hover:bg-emerald-100"
              >
                Todo aprobado
              </button>
              <button
                type="button"
                onClick={() => {
                  setAprobadas("0");
                  setRechazadas(String(lote.pendiente));
                }}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-medium text-rose-700 hover:bg-rose-100"
              >
                Todo rechazado
              </button>
            </div>

            {nRech > 0 && (
              <>
                <fieldset>
                  <legend className="text-xs font-medium text-slate-600">Tipo de defecto (opcional)</legend>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {CATEGORIAS_DEFECTO.map((c) => (
                      <button
                        key={c.valor}
                        type="button"
                        aria-pressed={categoria === c.valor}
                        onClick={() => setCategoria(categoria === c.valor ? "" : c.valor)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          categoria === c.valor
                            ? "border-rose-500 bg-rose-50 text-rose-700"
                            : "border-slate-300 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className={estiloEtiqueta}>
                  Motivo del rechazo
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Qué está mal (obligatorio). Producción lo verá al reasignar el retrabajo."
                    className={estiloCampo}
                  />
                </label>
              </>
            )}

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={enviando}
                className={estiloBotonSecundario}
              >
                Cancelar
              </button>
              <button type="submit" disabled={enviando} className={estiloBotonPrimario}>
                {enviando ? "Generando folios…" : "Generar informe"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
