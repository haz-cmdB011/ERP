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
  | "entrega_parte"
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
export default function EvaluarLote({
  lote,
  compacto = false,
  contexto = null,
}: {
  lote: LoteParaEvaluar;
  compacto?: boolean;
  // Se muestra en el asistente bajo el título (la ruta del mueble).
  contexto?: React.ReactNode;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  // Quién produjo el lote (para sugerir el área de origen y su responsable).
  const [origenLote, setOrigenLote] = useState<OrigenLote | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Las partes del despiece van en sus piezas (migración partes_en_piezas_y_ruta_por_parte).
  const unidad = lote.unidad ?? "pz";
  const mueble = `${lote.numero_pedido} · ${lote.modelo ?? `ítem ${lote.item_code}`}`;
  // Lo primero que se lee al revisar es el proceso (y la parte): de eso depende a quién se le paga.
  const titulo = `Revisar ${etiquetaProceso(lote)}`;

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
    const resultado = {
      p_aprobadas: r.aprobadas,
      p_rechazadas: r.rechazadas,
      p_motivo: r.rechazadas > 0 ? r.descripcion.trim() : null,
      p_categoria: r.rechazadas > 0 && r.categoria ? r.categoria : null,
    };
    // Las piezas de una entrega por partes se evalúan con su propia función.
    const { data, error } = lote.entrega_parte
      ? await createClient().rpc("evaluar_entrega_parte_calidad", { p_entrega_parte_id: lote.entrega_id, ...resultado })
      : await createClient().rpc("evaluar_entrega_calidad", { p_entrega_id: lote.entrega_id, ...resultado });
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
      `${mueble}, ${etiquetaProceso(lote)}: ${folios || "evaluado"}.`,
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
      {compacto ? (
        // Compacto: un solo botón, como "Asignar" en Producción; el detalle va al pasar el cursor
        // y dentro del asistente.
        <button
          type="button"
          onClick={abrir}
          title={`${lote.pendiente} ${unidad} del ${formatoFecha(lote.fecha_entrega)}, entregó ${lote.equipo}${
            lote.folio_rechazo ? `, retrabajo de ${lote.folio_rechazo}` : ""
          }`}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-400 max-md:min-h-11"
        >
          Revisar {etiquetaProceso(lote)}
        </button>
      ) : (
        <button
          type="button"
          onClick={abrir}
          title={`${lote.equipo} · ${etiquetaProceso(lote)} · entregado el ${formatoFecha(lote.fecha_entrega)}`}
          className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-100 max-md:min-h-11"
        >
          Revisar {etiquetaProceso(lote)}: {lote.pendiente} {unidad} del {formatoFecha(lote.fecha_entrega)}
        </button>
      )}
      {abierto && (
        <AsistenteNoConformidad
          titulo={titulo}
          contexto={contexto}
          subtitulo={`${mueble} · ${lote.equipo} · entregado el ${formatoFecha(lote.fecha_entrega)}${
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
