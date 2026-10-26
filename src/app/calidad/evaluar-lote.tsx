"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/avisos";
import AsistenteNoConformidad, { type ResultadoAsistente } from "@/app/calidad/asistente-no-conformidad";
import { guardarNoConformidad } from "@/lib/calidad/guardar-no-conformidad";
import { validarDetalle, type OrigenLote } from "@/lib/calidad/no-conformidad";
import { validarEvaluacion, type LoteCalidad } from "@/lib/calidad/lotes";
import { etiquetaProceso, formatoFecha } from "@/lib/produccion/asignaciones";

type LoteParaEvaluar = Pick<
  LoteCalidad,
  | "entrega_id"
  | "pedido_id"
  | "numero_pedido"
  | "item_code"
  | "modelo"
  | "unidad"
  | "proceso"
  | "vez_paso"
  | "veces_proceso"
  | "equipo"
  | "equipo_id"
  | "fecha_entrega"
  | "cantidad"
  | "pendiente"
  | "folio_rechazo"
  | "folio_hoja"
  | "parte_descripcion"
>;

interface InformeCreado {
  informe_id: string;
  folio: string;
  aprobado: boolean;
}

// Calidad evalúa un lote (una entrega verificada por Producción): cuántas
// piezas aprueba y cuántas rechaza. Un folio por resultado; lo rechazado lleva
// su no conformidad y vuelve a Producción como retrabajo. Se hace con el
// asistente por pasos (pensado para celular y tableta): aprobar todo es un toque.
export default function EvaluarLote({ lote, compacto = false }: { lote: LoteParaEvaluar; compacto?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  // Quién produjo el lote (para sugerir el área de origen y su responsable).
  const [origenLote, setOrigenLote] = useState<OrigenLote | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Una parte del despiece se entrega por muebles (la base de metal de 7 muebles).
  const unidad = lote.parte_descripcion ? "muebles" : (lote.unidad ?? "pz");
  const titulo = `${lote.numero_pedido} · ${lote.modelo ?? `ítem ${lote.item_code}`}`;

  function abrir() {
    setError(null);
    setOrigenLote(null);
    setAbierto(true);
    void leerOrigen();
  }

  // Si no se puede leer el equipo, simplemente no hay sugerencia de origen.
  async function leerOrigen() {
    const { data } = await createClient()
      .from("equipos_produccion")
      .select("encargado, es_planta")
      .eq("id", lote.equipo_id)
      .maybeSingle<{ encargado: string | null; es_planta: boolean }>();
    if (!data) return;
    setOrigenLote({
      proceso: lote.proceso,
      equipo: lote.equipo,
      esPlanta: data.es_planta,
      encargado: data.encargado,
    });
  }

  async function enviar(r: ResultadoAsistente) {
    const problema = validarEvaluacion(r.aprobadas, r.rechazadas, lote.pendiente, r.descripcion);
    const problemaDetalle = r.rechazadas > 0 && !problema ? validarDetalle(r.detalle, false) : null;
    if (problema || problemaDetalle) {
      setError(problema ?? problemaDetalle);
      return;
    }
    setEnviando(true);
    setError(null);
    const { data, error } = await createClient().rpc("evaluar_entrega_calidad", {
      p_entrega_id: lote.entrega_id,
      p_aprobadas: r.aprobadas,
      p_rechazadas: r.rechazadas,
      p_motivo: r.rechazadas > 0 ? r.descripcion.trim() : null,
      p_categoria: r.rechazadas > 0 && r.categoria ? r.categoria : null,
    });
    if (error) {
      setEnviando(false);
      setError(error.message);
      return;
    }
    const creados = (data ?? []) as InformeCreado[];
    // El detalle de la no conformidad va en el informe de lo rechazado.
    const noAprobado = creados.find((c) => !c.aprobado);
    const incompleto = noAprobado ? await guardarNoConformidad(noAprobado.informe_id, r.detalle, r.fotos) : null;
    setEnviando(false);
    setAbierto(false);
    if (incompleto) avisar(incompleto, "error");
    const folios = creados.map((c) => c.folio).join(" y ");
    const primero = noAprobado ?? creados[0];
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

  // En pantalla no se habla de "lotes": cada entrega se identifica por su fecha
  // (y, junto a otras del mismo mueble, por proceso y equipo).
  return (
    <>
      <div className="flex flex-col items-start gap-0.5">
        <button
          type="button"
          onClick={abrir}
          title={`${lote.equipo} · ${etiquetaProceso(lote)} · entregado el ${formatoFecha(lote.fecha_entrega)}`}
          className={`rounded-lg border border-brand-300 bg-brand-50 font-medium text-brand-800 transition-colors hover:bg-brand-100 max-md:min-h-11 ${
            compacto ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
          }`}
        >
          Revisar {lote.pendiente} {unidad} del {formatoFecha(lote.fecha_entrega)}
        </button>
        {compacto && (
          <span className="text-xs text-slate-500">
            {etiquetaProceso(lote)} · {lote.equipo}
            {lote.folio_rechazo ? ` · retrabajo de ${lote.folio_rechazo}` : ""}
          </span>
        )}
      </div>
      {abierto && (
        <AsistenteNoConformidad
          titulo={titulo}
          subtitulo={`${lote.equipo} · ${etiquetaProceso(lote)} · entregado el ${formatoFecha(lote.fecha_entrega)}${
            lote.folio_hoja ? ` · hoja ${lote.folio_hoja}` : ""
          }${lote.folio_rechazo ? ` · retrabajo de ${lote.folio_rechazo}` : ""}`}
          lote={{ pendiente: lote.pendiente, unidad: lote.unidad }}
          origenLote={origenLote}
          enviando={enviando}
          error={error}
          onCancelar={() => setAbierto(false)}
          onEnviar={enviar}
        />
      )}
    </>
  );
}
