// Lectura de lo que necesita la línea de tiempo de un mueble (ver linea-tiempo-mueble.ts).
// Todo con la sesión de quien escanea: lo que el RLS no le deje ver no aparece. Lanza
// ErrorLectura si una consulta falla.

import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";
import { firmarUrls } from "@/lib/storage/urls-firmadas";
import { nombreAreaOrigen } from "@/lib/calidad/revision-final";
import {
  BUCKET_FOTOS_ENTREGA,
  PROCESO_LABELS,
  esProceso,
  type AsignacionResumen,
} from "@/lib/produccion/asignaciones";
import { etiquetaPaso, type PasoRuta } from "@/lib/produccion/ruta";
import type { DatosLineaTiempo, InformeTiempo } from "./linea-tiempo-mueble";
import type { CobroMueble } from "./pago-maquilador";

export interface ComponenteTiempo {
  id: string;
  item_code: number;
  modelo: string | null;
}

interface Entrada {
  item: {
    id: string;
    unidad: string | null;
    liberado_en: string | null;
    liberado_por: string | null;
  };
  componentes: ComponenteTiempo[];
  folio: { folio: string; generado_en: string } | null;
  // De la vista asignaciones_produccion_resumen (ya leídas para la ruta).
  asignaciones: AsignacionResumen[];
  // Pasos vigentes de la ruta, para nombrar el origen y el regreso de la revisión final.
  ruta: PasoRuta[];
  // Ya calculados para el pago al maquilador (ver pago-maquilador.ts).
  cobros: CobroMueble[];
}

export async function cargarLineaTiempo(supabase: SupabaseClient, e: Entrada): Promise<DatosLineaTiempo> {
  const idsAsignaciones = e.asignaciones.map((a) => a.id);
  const idsItems = [e.item.id, ...e.componentes.map((c) => c.id)];

  const [autores, entregas, informes, revisiones, pasosTodos] = await Promise.all([
    // La vista no trae quién asignó ni quién canceló.
    idsAsignaciones.length
      ? leer(
          supabase
            .from("asignaciones_produccion")
            .select("id, creado_por, cancelada_por")
            .in("id", idsAsignaciones)
            .returns<{ id: string; creado_por: string | null; cancelada_por: string | null }[]>(),
          "quién asignó"
        )
      : [],
    idsAsignaciones.length
      ? leer(
          supabase
            .from("entregas_produccion")
            .select(
              "id, asignacion_id, cantidad, foto_path, registrado_en, registrado_por, anulada_en, motivo_anulacion, verificada_en, rechazada_en, motivo_rechazo"
            )
            .in("asignacion_id", idsAsignaciones)
            .returns<
              {
                id: string;
                asignacion_id: string;
                cantidad: number | string;
                foto_path: string | null;
                registrado_en: string;
                registrado_por: string | null;
                anulada_en: string | null;
                motivo_anulacion: string | null;
                verificada_en: string | null;
                rechazada_en: string | null;
                motivo_rechazo: string | null;
              }[]
            >(),
          "las entregas del mueble"
        )
      : [],
    leer(
      supabase
        .from("informes_calidad")
        .select("id, planeacion_item_id, folio, aprobado, cantidad, elaborado_en, elaborado_por, tipo_reporte")
        .in("planeacion_item_id", idsItems)
        .returns<
          (Omit<InformeTiempo, "cantidad" | "componente"> & {
            planeacion_item_id: string;
            cantidad: number | string | null;
          })[]
        >(),
      "los informes de Calidad del mueble"
    ),
    leer(
      supabase
        .from("revisiones_finales_calidad")
        .select("id, folio, aprobado, cantidad, motivo, elaborado_en, elaborado_por, origen_paso_id, origen_area, paso_retrabajo_id")
        .eq("planeacion_item_id", e.item.id)
        .returns<
          {
            id: string;
            folio: string;
            aprobado: boolean;
            cantidad: number | string;
            motivo: string | null;
            elaborado_en: string;
            elaborado_por: string | null;
            origen_paso_id: string | null;
            origen_area: string | null;
            paso_retrabajo_id: string | null;
          }[]
        >(),
      "la revisión final del mueble"
    ),
    // Incluye los pasos quitados: una revisión vieja puede apuntar a uno.
    leer(
      supabase
        .from("pasos_ruta_produccion")
        .select("id, proceso")
        .eq("planeacion_item_id", e.item.id)
        .returns<{ id: string; proceso: string }[]>(),
      "los pasos de la ruta"
    ),
  ]);

  // Nombre de cada paso: "Armado 2" si sigue en la ruta; si ya se quitó, solo el proceso.
  const nombrePaso = new Map<string, string>();
  for (const p of pasosTodos ?? []) if (esProceso(p.proceso)) nombrePaso.set(p.id, PROCESO_LABELS[p.proceso]);
  e.ruta.forEach((p, i) => {
    if (p.id) nombrePaso.set(p.id, etiquetaPaso(e.ruta, i));
  });

  const autorPorId = new Map((autores ?? []).map((a) => [a.id, a]));
  const fotos = await firmarUrls(
    supabase,
    BUCKET_FOTOS_ENTREGA,
    (entregas ?? []).flatMap((x) => (x.foto_path ? [x.foto_path] : []))
  );

  const componentePorId = new Map(e.componentes.map((c) => [c.id, c]));
  const etiquetaComponente = (id: string) => {
    const c = componentePorId.get(id);
    return c ? `Componente ${c.item_code}${c.modelo ? ` · ${c.modelo}` : ""}` : null;
  };

  // Nombres de todos los que aparecen, en una sola consulta.
  const ids = new Set<string>();
  const sumar = (id: string | null | undefined) => {
    if (id) ids.add(id);
  };
  sumar(e.item.liberado_por);
  for (const a of autores ?? []) {
    sumar(a.creado_por);
    sumar(a.cancelada_por);
  }
  for (const x of entregas ?? []) sumar(x.registrado_por);
  for (const i of informes ?? []) sumar(i.elaborado_por);
  for (const r of revisiones ?? []) sumar(r.elaborado_por);
  for (const c of e.cobros) {
    sumar(c.capturado_por);
    sumar(c.pagado_por);
  }
  const perfiles = ids.size
    ? await leer(
        supabase
          .from("perfiles")
          .select("id, nombre_completo, email")
          .in("id", [...ids])
          .returns<{ id: string; nombre_completo: string | null; email: string | null }[]>(),
        "los nombres del personal"
      )
    : [];
  const nombres = new Map<string, string>();
  for (const p of perfiles ?? []) {
    const nombre = p.nombre_completo?.trim() || p.email;
    if (nombre) nombres.set(p.id, nombre);
  }

  return {
    unidad: e.item.unidad,
    liberado: e.item.liberado_en ? { en: e.item.liberado_en, por: e.item.liberado_por } : null,
    hoja: e.folio ? { folio: e.folio.folio, en: e.folio.generado_en } : null,
    asignaciones: e.asignaciones.map((a) => ({
      id: a.id,
      equipo: a.equipo,
      proceso: a.proceso,
      vez_paso: a.vez_paso,
      veces_proceso: a.veces_proceso,
      cantidad: Number(a.cantidad),
      creado_en: a.creado_en,
      creado_por: autorPorId.get(a.id)?.creado_por ?? null,
      cancelada_en: a.cancelada_en,
      cancelada_por: autorPorId.get(a.id)?.cancelada_por ?? null,
      motivo_cancelacion: a.motivo_cancelacion,
      adelantada: a.adelantada,
      folio_rechazo: a.folio_rechazo,
      folio_revision_final: a.folio_revision_final,
    })),
    entregas: (entregas ?? []).map((x) => ({
      id: x.id,
      asignacion_id: x.asignacion_id,
      cantidad: Number(x.cantidad),
      registrado_en: x.registrado_en,
      registrado_por: x.registrado_por,
      anulada_en: x.anulada_en,
      motivo_anulacion: x.motivo_anulacion,
      verificada_en: x.verificada_en,
      rechazada_en: x.rechazada_en,
      motivo_rechazo: x.motivo_rechazo,
      fotoUrl: x.foto_path ? (fotos.get(x.foto_path) ?? null) : null,
    })),
    informes: (informes ?? []).map((i) => ({
      id: i.id,
      folio: i.folio,
      aprobado: i.aprobado,
      cantidad: i.cantidad == null ? null : Number(i.cantidad),
      elaborado_en: i.elaborado_en,
      elaborado_por: i.elaborado_por,
      tipo_reporte: i.tipo_reporte,
      componente: i.planeacion_item_id === e.item.id ? null : etiquetaComponente(i.planeacion_item_id),
    })),
    revisiones: (revisiones ?? []).map((r) => ({
      id: r.id,
      folio: r.folio,
      aprobado: r.aprobado,
      cantidad: Number(r.cantidad),
      motivo: r.motivo,
      elaborado_en: r.elaborado_en,
      elaborado_por: r.elaborado_por,
      origen: (r.origen_paso_id && nombrePaso.get(r.origen_paso_id)) || nombreAreaOrigen(r.origen_area),
      regresaA: r.paso_retrabajo_id ? nombrePaso.get(r.paso_retrabajo_id) ?? null : null,
    })),
    cobros: e.cobros,
    nombres,
  };
}
