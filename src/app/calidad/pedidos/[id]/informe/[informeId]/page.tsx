import { notFound } from "next/navigation";
import type { LoteCalidad } from "@/lib/calidad/lotes";
import { PROCESO_LABELS } from "@/lib/produccion/asignaciones";
import { createClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/site-url";
import { getImagenesPorItem } from "@/lib/planeacion/imagenes";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";
import { getPerfilActual, puedeEvaluarCalidad } from "@/lib/auth/get-perfil";
import { firmarUrls } from "@/lib/storage/urls-firmadas";
import {
  BUCKET_FOTOS_NO_CONFORMIDAD,
  periodoProduccion,
  type DetalleNoConformidad,
} from "@/lib/calidad/no-conformidad";
import { estatusDeInforme } from "@/lib/calidad/estatus-db";
import EditarNoConformidad from "../../editar-no-conformidad";
import InformeNoConformidadFicha from "../../informe-no-conformidad-ficha";
import InformeFicha, {
  type InformeFichaItem,
  type InformeFichaPedido,
} from "../../informe-ficha";
import ImprimirButton from "../../imprimir-button";
import DescargarPdfButton from "../../descargar-pdf-button";

import { leer } from "@/lib/supabase/leer";
interface InformeRow {
  id: string;
  folio: string;
  aprobado: boolean;
  descripcion: string | null;
  elaborado_por: string | null;
  elaborado_en: string;
  planeacion_item_id: string;
  categoria: string | null;
  entrega_id: string | null;
  cantidad: number | string | null;
  piezas_verificadas: number | string | null;
  tipo_reporte: string | null;
  motivo_codigo: string | null;
  autoriza: string | null;
  motivo: { codigo: string; nombre: string; tipo: string } | null;
  area_deteccion: string | null;
  responsable_deteccion: string | null;
  area_origen: string | null;
  responsable_origen: string | null;
  acciones_correctivas: string | null;
  solucion: string | null;
  solucion_en: string | null;
  material: string | null;
  mano_obra: string | null;
  severidad: string | null;
  causa_raiz_tipo: string | null;
  causa_raiz: string | null;
  cerrado_en: string | null;
  piezas_afectadas: number | string | null;
}

interface ItemConVersion extends InformeFichaItem {
  id: string;
  tipo_registro: string | null;
  parent_item_id: string | null;
  pedido_versiones: { pedido_id: string } | null;
}

export default async function InformeCalidadPage({
  params,
}: {
  params: Promise<{ id: string; informeId: string }>;
}) {
  const { id, informeId } = await params;
  const supabase = await createClient();

  const pedido = await leer(
    supabase
    .from("pedidos")
    .select("numero_pedido, fecha_pedido, fecha_entrega, proyectos ( nombre, cliente )")
    .eq("id", id)
    .maybeSingle<InformeFichaPedido>(),
    "pedidos"
  );

  if (!pedido) {
    notFound();
  }

  const informe = await leer(
    supabase
    .from("informes_calidad")
    .select("id, folio, aprobado, descripcion, elaborado_por, elaborado_en, planeacion_item_id, categoria, entrega_id, cantidad, piezas_verificadas, tipo_reporte, motivo_codigo, autoriza, motivo:motivos_calidad ( codigo, nombre, tipo ), area_deteccion, responsable_deteccion, area_origen, responsable_origen, acciones_correctivas, solucion, solucion_en, material, mano_obra, severidad, causa_raiz_tipo, causa_raiz, cerrado_en, piezas_afectadas")
    .eq("id", informeId)
    .maybeSingle<InformeRow>(),
    "informes_calidad"
  );

  if (!informe) {
    notFound();
  }

  // Mismo guard que Producción: el ítem del informe debe pertenecer a ESTE
  // pedido, para no exponer un informe de otro PM si se edita la URL.
  const item = await leer(
    supabase
    .from("planeacion_items")
    .select("id, item_code, modelo, descripcion, tipo_registro, parent_item_id, pedido_versiones!inner ( pedido_id )")
    .eq("id", informe.planeacion_item_id)
    .eq("pedido_versiones.pedido_id", id)
    .maybeSingle<ItemConVersion>(),
    "planeacion_items"
  );

  if (!item) {
    notFound();
  }

  let elaboradoPorNombre: string | null = null;
  if (informe.elaborado_por) {
    const { data: perfilElaboro } = await supabase
      .from("perfiles")
      .select("nombre_completo, email")
      .eq("id", informe.elaborado_por)
      .maybeSingle<{ nombre_completo: string | null; email: string | null }>();
    elaboradoPorNombre = perfilElaboro?.nombre_completo || perfilElaboro?.email || null;
  }

  const folioProd = await leer(
    supabase
    .from("folios_produccion")
    .select("folio")
    .eq("planeacion_item_id", item.id)
    .maybeSingle<{ folio: string }>(),
    "folios_produccion"
  );

  // Informe de un lote: de qué entrega salieron las piezas.
  const lote = informe.entrega_id
    ? await leer(
        supabase
          .from("lotes_calidad")
          .select("unidad, equipo, proceso, fecha_entrega, folio_rechazo")
          .eq("entrega_id", informe.entrega_id)
          .maybeSingle<Pick<LoteCalidad, "unidad" | "equipo" | "proceso" | "fecha_entrega" | "folio_rechazo">>(),
        "lotes_calidad"
      )
    : null;

  // Fotos de la no conformidad (solo los informes No aprobado las llevan).
  const fotosFilas = informe.aprobado
    ? []
    : ((await leer(
        supabase
          .from("informe_calidad_fotos")
          .select("foto_path")
          .eq("informe_id", informe.id)
          .order("subida_en", { ascending: true })
          .returns<{ foto_path: string }[]>(),
        "informe_calidad_fotos"
      )) ?? []);
  const urlPorRuta = await firmarUrls(
    supabase,
    BUCKET_FOTOS_NO_CONFORMIDAD,
    fotosFilas.map((f) => f.foto_path)
  );
  const fotosNoConformidad = fotosFilas.map((f) => urlPorRuta.get(f.foto_path)).filter((u): u is string => !!u);

  // Inicio y término de producción: de las asignaciones del mueble (de su
  // mueble padre si es un componente) y sus entregas vigentes.
  const itemProduccionId = item.tipo_registro === "FU" && item.parent_item_id ? item.parent_item_id : item.id;
  const asignaciones =
    (await leer(
      supabase
        .from("asignaciones_produccion_resumen")
        .select("id, fecha_asignacion, cantidad, entregado")
        .eq("planeacion_item_id", itemProduccionId)
        .is("cancelada_en", null)
        .returns<{ id: string; fecha_asignacion: string; cantidad: number | string; entregado: number | string }[]>(),
      "asignaciones_produccion_resumen"
    )) ?? [];
  const entregas = asignaciones.length
    ? ((await leer(
        supabase
          .from("entregas_produccion")
          .select("fecha_entrega")
          .in("asignacion_id", asignaciones.map((a) => a.id))
          .is("anulada_en", null)
          .returns<{ fecha_entrega: string }[]>(),
        "entregas_produccion"
      )) ?? [])
    : [];
  const produccion = periodoProduccion(
    asignaciones.map((a) => ({
      fecha_asignacion: a.fecha_asignacion,
      cantidad: Number(a.cantidad),
      entregado: Number(a.entregado),
    })),
    entregas
  );

  const perfil = await getPerfilActual(supabase);
  const puedeEditar = !informe.aprobado && puedeEvaluarCalidad(perfil);
  const esLote = informe.entrega_id != null;
  const estatus = informe.aprobado
    ? null
    : await estatusDeInforme(supabase, {
        id: informe.id,
        entrega_id: informe.entrega_id,
        cantidad: informe.cantidad != null ? Number(informe.cantidad) : null,
        cerrado_en: informe.cerrado_en,
      });
  const detalleInicial: DetalleNoConformidad = {
    tipoReporte: informe.tipo_reporte ?? "",
    motivoCodigo: informe.motivo_codigo ?? "",
    areaDeteccion: informe.area_deteccion ?? "",
    responsableDeteccion: informe.responsable_deteccion ?? "",
    areaOrigen: informe.area_origen ?? "",
    responsableOrigen: informe.responsable_origen ?? "",
    accionesCorrectivas: informe.acciones_correctivas ?? "",
    solucion: informe.solucion ?? "",
    autoriza: informe.autoriza ?? "",
    material: informe.material ?? "",
    manoObra: informe.mano_obra ?? "",
    severidad: informe.severidad ?? "",
    causaRaizTipo: informe.causa_raiz_tipo ?? "",
    causaRaiz: informe.causa_raiz ?? "",
    piezasAfectadas: informe.piezas_afectadas != null ? String(informe.piezas_afectadas) : "",
  };

  const baseUrl = await getBaseUrl();
  const imagenesPorItem = await getImagenesPorItem(supabase, [item.id]);
  const nombreArchivo = nombreArchivoSeguro(
    `${pedido.numero_pedido} ${pedido.proyectos?.nombre ?? ""} - Informe ${informe.folio}.pdf`
  );

  const qrUrl = `${baseUrl}/calidad/pedidos/${id}/informe/${informe.id}`;
  const loteFicha =
    lote && informe.cantidad != null
      ? {
          cantidad: Number(informe.cantidad),
          unidad: lote.unidad,
          equipo: lote.equipo,
          proceso: PROCESO_LABELS[lote.proceso],
          fechaEntrega: lote.fecha_entrega,
          folioRechazo: lote.folio_rechazo,
        }
      : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6 print:max-w-none print:p-0">
      <div className="flex items-center justify-end print:hidden">
        <div className="flex flex-wrap justify-end gap-2">
          {puedeEditar && (
            <EditarNoConformidad
              informeId={informe.id}
              inicial={detalleInicial}
              pedirPiezas={!esLote}
              fotosExistentes={fotosNoConformidad.length}
              cerrado={estatus?.estatus === "cerrado"}
              puedeCerrarAMano={!esLote}
            />
          )}
          <DescargarPdfButton nombreArchivo={nombreArchivo} />
          <ImprimirButton />
        </div>
      </div>

      {informe.aprobado || !estatus ? (
        <InformeFicha
          pedido={pedido}
          item={item}
          informe={{
            folio: informe.folio,
            aprobado: informe.aprobado,
            descripcion: informe.descripcion,
            elaborado_en: informe.elaborado_en,
            elaboradoPorNombre,
            categoria: informe.categoria,
            lote: loteFicha,
          }}
          imagenUrls={imagenesPorItem.get(item.id) ?? []}
          folioProduccion={folioProd?.folio ?? null}
          produccion={produccion}
          qrUrl={qrUrl}
        />
      ) : (
        <InformeNoConformidadFicha
          pedido={pedido}
          item={item}
          informe={{
            folio: informe.folio,
            elaborado_en: informe.elaborado_en,
            elaboradoPorNombre,
            descripcion: informe.descripcion,
            categoria: informe.categoria,
            tipoReporte: informe.tipo_reporte,
            motivo: informe.motivo,
            areaDeteccion: informe.area_deteccion,
            responsableDeteccion: informe.responsable_deteccion,
            areaOrigen: informe.area_origen,
            responsableOrigen: informe.responsable_origen,
            accionesCorrectivas: informe.acciones_correctivas,
            solucion: informe.solucion,
            solucionEn: informe.solucion_en,
            material: informe.material,
            manoObra: informe.mano_obra,
            autoriza: informe.autoriza,
            severidad: informe.severidad,
            causaRaizTipo: informe.causa_raiz_tipo,
            causaRaiz: informe.causa_raiz,
            // En un lote, los muebles afectados son las piezas rechazadas del lote.
            mueblesAfectados: esLote && informe.cantidad != null ? Number(informe.cantidad) : null,
            mueblesFabricados: informe.piezas_verificadas != null ? Number(informe.piezas_verificadas) : null,
            piezasAfectadas: informe.piezas_afectadas != null ? Number(informe.piezas_afectadas) : null,
            estatus: estatus.estatus,
            fechaCierre: estatus.fecha,
            lote: loteFicha
              ? {
                  equipo: loteFicha.equipo,
                  proceso: loteFicha.proceso,
                  fechaEntrega: loteFicha.fechaEntrega,
                  folioRechazo: loteFicha.folioRechazo,
                }
              : null,
          }}
          imagenUrls={imagenesPorItem.get(item.id) ?? []}
          fotos={fotosNoConformidad}
          folioProduccion={folioProd?.folio ?? null}
          produccion={produccion}
          qrUrl={qrUrl}
        />
      )}
    </main>
  );
}
