"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import { CATEGORIAS_DEFECTO, nombreCategoria } from "@/lib/calidad/categorias";
import {
  AREAS_ORIGEN,
  leerOrigen,
  nombreAreaOrigen,
  validarRevisionFinal,
  type ResumenRevisionFinal,
  type RevisionFinal,
} from "@/lib/calidad/revision-final";
import { formatoFechaDMA } from "@/lib/resumen/entrega";
import { mensajeErrorRpc } from "@/lib/produccion/asignaciones";
import Modal, {
  estiloBotonPrimario,
  estiloBotonSecundario,
  estiloCampo,
  estiloEtiqueta,
} from "@/app/produccion/asignaciones/modal";

export interface MuebleRevisionFinal {
  id: string;
  item_code: number;
  modelo: string | null;
  unidad: string | null;
  resumen: ResumenRevisionFinal;
  revisiones: RevisionFinal[];
  // Pasos vigentes de su ruta, para elegir a dónde regresa lo rechazado.
  pasos: { id: string; etiqueta: string }[];
}

// Revisión final del mueble completo antes de mandarlo a obra (ajuste
// revision_final). Solo aparecen muebles con piezas que Producción ya verificó en
// el último paso de su ruta, o con revisiones finales anteriores.
export default function RevisionFinalSeccion({
  muebles,
  numeroPedido,
  puedeEvaluar,
}: {
  muebles: MuebleRevisionFinal[];
  numeroPedido: string;
  puedeEvaluar: boolean;
}) {
  if (muebles.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Revisión final</h2>
      <p className="text-sm text-slate-500">
        El mueble completo, cuando Producción ya lo liberó del último paso de su ruta, antes de mandarlo a obra.
        Lo que no pase regresa al paso que elijas y sigue el resto de la ruta desde ahí; anota también dónde
        nació la falla.
      </p>
      <ul className="flex flex-col divide-y divide-slate-100">
        {muebles.map((m) => (
          <FilaMueble key={m.id} mueble={m} numeroPedido={numeroPedido} puedeEvaluar={puedeEvaluar} />
        ))}
      </ul>
    </section>
  );
}

function FilaMueble({
  mueble: m,
  numeroPedido,
  puedeEvaluar,
}: {
  mueble: MuebleRevisionFinal;
  numeroPedido: string;
  puedeEvaluar: boolean;
}) {
  const r = m.resumen;
  const unidad = m.unidad ?? "pz";
  return (
    <li className="flex flex-col gap-1 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-slate-900">
          Ítem {m.item_code}
          {m.modelo ? ` · ${m.modelo}` : ""}
          <span className="ml-2 font-normal text-slate-600 tabular-nums">
            {r.aprobadas}/{r.cantidad_total} {unidad} aprobadas
            {r.pendientes > 0 ? ` · ${r.pendientes} listas para revisar` : ""}
          </span>
        </p>
        {r.liberado_a_obra ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            ✓ Liberado a obra
          </span>
        ) : (
          puedeEvaluar &&
          r.pendientes > 0 && <Revisar mueble={m} titulo={`${numeroPedido} · ${m.modelo ?? `ítem ${m.item_code}`}`} />
        )}
      </div>
      {m.revisiones.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-slate-600">
          {m.revisiones.map((x) => (
            <li key={x.id}>
              <span className={`font-mono font-medium ${x.aprobado ? "text-emerald-700" : "text-rose-700"}`}>
                {x.folio}
              </span>{" "}
              {x.aprobado ? "aprobó" : "rechazó"} {x.cantidad} {unidad} el {formatoFechaDMA(x.elaborado_en)}
              {!x.aprobado && (
                <>
                  {" · regresa a "}
                  {m.pasos.find((p) => p.id === x.paso_retrabajo_id)?.etiqueta ?? "un paso que ya no está en la ruta"}
                  {(x.origen_paso_id || x.origen_area) &&
                    ` · nació en ${
                      x.origen_area
                        ? nombreAreaOrigen(x.origen_area)
                        : (m.pasos.find((p) => p.id === x.origen_paso_id)?.etiqueta ?? "un paso que ya no está")
                    }`}
                  {nombreCategoria(x.categoria) ? ` · ${nombreCategoria(x.categoria)}` : ""}
                  {x.motivo ? ` · ${x.motivo}` : ""}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// También lo usa la ficha del QR del mueble (/q/<ítem>), con su propio estilo de botón.
export function Revisar({
  mueble: m,
  titulo,
  className,
}: {
  mueble: Pick<MuebleRevisionFinal, "id" | "unidad" | "resumen" | "pasos">;
  titulo: string;
  className?: string;
}) {
  const router = useRouter();
  const pendientes = m.resumen.pendientes;
  const [abierto, setAbierto] = useState(false);
  const [aprobadas, setAprobadas] = useState(String(pendientes));
  const [rechazadas, setRechazadas] = useState("0");
  const [categoria, setCategoria] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pasoId, setPasoId] = useState("");
  // Dónde nació la falla: "paso:<id>" o "area:<clave>" (ver leerOrigen).
  const [origen, setOrigen] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nAprob = Number(aprobadas.replace(",", ".")) || 0;
  const nRech = Number(rechazadas.replace(",", ".")) || 0;

  function abrir() {
    setAprobadas(String(pendientes));
    setRechazadas("0");
    setCategoria("");
    setMotivo("");
    setPasoId("");
    setOrigen("");
    setError(null);
    setAbierto(true);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const problema = validarRevisionFinal(nAprob, nRech, pendientes, motivo, pasoId || null, origen);
    if (problema) return setError(problema);
    const o = nRech > 0 ? leerOrigen(origen) : null;
    setEnviando(true);
    setError(null);
    const { data, error } = await createClient().rpc("registrar_revision_final", {
      p_origen_paso_id: o?.pasoId ?? null,
      p_origen_area: o?.area ?? null,
      p_item_id: m.id,
      p_aprobadas: nAprob,
      p_rechazadas: nRech,
      p_motivo: nRech > 0 ? motivo.trim() : null,
      p_categoria: nRech > 0 && categoria ? categoria : null,
      p_paso_id: nRech > 0 ? pasoId : null,
    });
    setEnviando(false);
    if (error) return setError(mensajeErrorRpc(error.message));
    const folios = ((data ?? []) as { folio: string }[]).map((f) => f.folio).join(" y ");
    setAbierto(false);
    avisar(`${titulo}: ${folios || "revisado"}.`);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={
          className ??
          "rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-100 max-md:min-h-11"
        }
      >
        Revisión final ({pendientes})
      </button>
      {abierto && (
        <Modal titulo="Revisión final" subtitulo={titulo} onCerrar={() => !enviando && setAbierto(false)}>
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              {pendientes} {m.unidad ?? "pz"} listas: ya pasaron por todos los procesos de su ruta.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className={estiloEtiqueta}>
                Aprobadas
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={aprobadas}
                  onChange={(e) => setAprobadas(e.target.value)}
                  className={estiloCampo}
                />
              </label>
              <label className={estiloEtiqueta}>
                Rechazadas
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={rechazadas}
                  onChange={(e) => setRechazadas(e.target.value)}
                  className={estiloCampo}
                />
              </label>
            </div>
            {nRech > 0 && (
              <>
                <label className={estiloEtiqueta}>
                  Regresa a
                  <select
                    required
                    value={pasoId}
                    onChange={(e) => setPasoId(e.target.value)}
                    className={estiloCampo}
                  >
                    <option value="" disabled>
                      Elige el paso de la ruta
                    </option>
                    {m.pasos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.etiqueta}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={estiloEtiqueta}>
                  Dónde nació la falla
                  <select required value={origen} onChange={(e) => setOrigen(e.target.value)} className={estiloCampo}>
                    <option value="" disabled>
                      Elige un paso de la ruta o un área
                    </option>
                    <optgroup label="Un paso de la ruta">
                      {m.pasos.map((p) => (
                        <option key={p.id} value={`paso:${p.id}`}>
                          {p.etiqueta}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Otra área">
                      {AREAS_ORIGEN.map((a) => (
                        <option key={a.valor} value={`area:${a.valor}`}>
                          {a.nombre}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <span className="text-xs font-normal text-slate-500">
                    Puede no ser a donde regresa: p. ej. lo arregla Armado, pero el plano venía mal de Ingeniería.
                  </span>
                </label>
                <label className={estiloEtiqueta}>
                  Tipo de defecto (opcional)
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={estiloCampo}>
                    <option value="">Sin especificar</option>
                    {CATEGORIAS_DEFECTO.map((c) => (
                      <option key={c.valor} value={c.valor}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={estiloEtiqueta}>
                  Motivo
                  <textarea
                    required
                    rows={2}
                    maxLength={500}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    className={estiloCampo}
                  />
                </label>
              </>
            )}
            {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
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
                {enviando ? "Guardando…" : "Guardar revisión"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
