import Link from "next/link";
import Migas from "@/components/migas";
import { metadataPedido } from "@/lib/planeacion/titulo-pedido";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getImagenesConGrandePorItem } from "@/lib/planeacion/imagenes";
import PestanasPedido from "./pestanas-pedido";
import ItemsLiberacionTable, {
  type ItemLiberacionRow,
} from "./items-liberacion-table";

import { leer } from "@/lib/supabase/leer";
interface VersionRow {
  id: string;
  numero_version: number;
  es_version_activa: boolean;
  notas: string | null;
  created_at: string;
  cargas_archivo: {
    nombre_archivo: string;
    filas_totales: number | null;
    filas_exitosas: number | null;
    estado: string;
  } | null;
}

type ItemRow = Omit<ItemLiberacionRow, "folio" | "imagenUrl" | "imagenGrandeUrl">;

export const generateMetadata = metadataPedido;

export default async function PedidoProduccionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  const { version } = await searchParams;
  const supabase = await createClient();

  // Perfil, pedido y versiones no dependen entre sí: se piden a la vez (un solo
  // viaje a la base en vez de tres seguidos).
  const perfilPromesa = (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("perfiles")
      .select("rol, area")
      .eq("id", user.id)
      .maybeSingle<{ rol: string; area: string | null }>();
    return data;
  })();

  const pedidoPromesa = supabase
    .from("pedidos")
    .select(
      "id, numero_pedido, orden_trabajo, fecha_pedido, fecha_entrega, estado, eliminado_en, proyectos ( nombre, cliente )"
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      numero_pedido: string;
      orden_trabajo: string | null;
      fecha_pedido: string | null;
      fecha_entrega: string | null;
      estado: string;
      eliminado_en: string | null;
      proyectos: { nombre: string; cliente: string } | null;
    }>();

  const versionesPromesa = supabase
    .from("pedido_versiones")
    .select(
      "id, numero_version, es_version_activa, notas, created_at, cargas_archivo:carga_id ( nombre_archivo, filas_totales, filas_exitosas, estado )"
    )
    .eq("pedido_id", id)
    .order("numero_version", { ascending: false })
    .returns<VersionRow[]>();

  const [perfil, { data: pedido }, { data: versiones }] = await Promise.all([
    perfilPromesa,
    pedidoPromesa,
    versionesPromesa,
  ]);

  // Refleja is_produccion()/is_admin_area('produccion') del lado del
  // servidor (ver migración planeacion_items_borrado_produccion): solo
  // controla qué botones se muestran — el permiso real lo sigue exigiendo
  // el RPC en la base.
  const esDesarrollador = perfil?.rol === "desarrollador";
  const puedeSolicitarEliminacion =
    esDesarrollador || (perfil?.area === "produccion" && (perfil.rol === "administrador" || perfil.rol === "trabajador"));
  const puedeEliminarDefinitivo =
    esDesarrollador || (perfil?.area === "produccion" && perfil.rol === "administrador");

  // Un pedido eliminado (papelera de Planeación) deja de existir para
  // Producción — en cuanto se restaure desde Planeación, vuelve a
  // aparecer como un pedido normal sin ningún paso extra.
  if (!pedido || pedido.eliminado_en) {
    notFound();
  }

  const versionSeleccionada =
    (version && versiones?.find((v) => String(v.numero_version) === version)) ||
    versiones?.find((v) => v.es_version_activa) ||
    versiones?.[0] ||
    null;

  const itemsBase = versionSeleccionada
    ? await leer(
        supabase
        .from("planeacion_items")
        .select(
          "id, item_code, tipo_registro, tipo_material, modelo, descripcion, cantidad_x_mueble, unidad, cantidad_total, parent_item_id, fila_excel_origen, ingenieria, lista_insumos, suministro_mats, estado_liberacion, eliminacion_solicitada_en, eliminacion_solicitada_por, estado_revision"
        )
        .eq("pedido_version_id", versionSeleccionada.id)
        .order("fila_excel_origen")
        .returns<ItemRow[]>(),
        "planeacion_items"
      )
    : null;

  // Producción trabaja solo con lo que Planeación ya liberó de este PM: lo pendiente no se muestra. La
  // papelera de Producción conserva los ítems que se enviaron ahí, aunque ya no estén liberados.
  const itemsLiberados = (itemsBase ?? []).filter(
    (i) => i.estado_liberacion === "enviado_a_produccion" || i.eliminacion_solicitada_en
  );

  // Folio único de producción de cada ítem (se asigna al liberarlo y no cambia).
  const idsItems = itemsLiberados.map((i) => i.id);
  // Miniatura de cada ítem: la primera imagen guardada (URL firmada del bucket
  // privado, mismo helper que usan Planeación y Calidad). Se piden a la vez que los folios.
  const [folios, imagenesPorItem] = await Promise.all([
    idsItems.length
      ? leer(
          supabase
            .from("folios_produccion")
            .select("planeacion_item_id, folio")
            .in("planeacion_item_id", idsItems)
            .returns<{ planeacion_item_id: string; folio: string }[]>(),
          "folios_produccion"
        )
      : Promise.resolve([] as { planeacion_item_id: string; folio: string }[]),
    getImagenesConGrandePorItem(supabase, idsItems),
  ]);
  const folioPorItem = new Map((folios ?? []).map((f) => [f.planeacion_item_id, f.folio]));

  // Qué sigue con cada mueble liberado: sin asignar, en taller o entregado. Sale de las asignaciones
  // vigentes del PM; es solo para sugerir el siguiente paso, no cambia nada.
  const situacionPorItem: Record<string, "sin-asignar" | "en-taller" | "entregado"> = {};
  const asignaciones = await leer(
    supabase
      .from("asignaciones_produccion_resumen")
      .select("planeacion_item_id, estado")
      .eq("pedido_id", id)
      .in("estado", ["en_proceso", "parcial", "entregada"])
      .returns<{ planeacion_item_id: string | null; estado: string }[]>(),
    "asignaciones_produccion_resumen"
  );
  for (const a of asignaciones ?? []) {
    if (!a.planeacion_item_id) continue;
    const actual = situacionPorItem[a.planeacion_item_id];
    if (a.estado === "entregada") {
      if (!actual) situacionPorItem[a.planeacion_item_id] = "entregado";
    } else {
      situacionPorItem[a.planeacion_item_id] = "en-taller";
    }
  }

  const items: ItemLiberacionRow[] | null = itemsBase
    ? itemsLiberados.map((i) => ({
        ...i,
        folio: folioPorItem.get(i.id) ?? null,
        imagenUrl: imagenesPorItem.get(i.id)?.[0]?.url ?? null,
        imagenGrandeUrl: imagenesPorItem.get(i.id)?.[0]?.urlGrande ?? null,
      }))
    : null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Migas
        items={[
          { etiqueta: "Pedidos", href: "/produccion" },
          ...(pedido.orden_trabajo
            ? [{ etiqueta: `O.T. ${pedido.orden_trabajo}`, href: `/produccion/ot/${encodeURIComponent(pedido.orden_trabajo)}` }]
            : []),
          { etiqueta: pedido.numero_pedido },
        ]}
      />
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {pedido.numero_pedido}
        </h1>
        <p className="text-sm text-slate-600">
          {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Entrega: {pedido.fecha_entrega ?? "—"}
        </p>
      </div>

      <PestanasPedido pedidoId={id} activa="muebles" versiones={versiones?.length ?? 0} />

      {/* Con una sola versión no hay nada que elegir: el selector solo aparece si Planeación
          subió el pedido más de una vez. */}
      {versiones && versiones.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex w-fit flex-wrap gap-1 rounded border border-slate-200 bg-slate-50 p-1 text-sm">
              {versiones.map((v) => (
                <Link
                  key={v.id}
                  href={`/produccion/pedidos/${id}?version=${v.numero_version}`}
                  className={`rounded px-3 py-1 font-medium transition-colors pointer-coarse:py-2 ${
                    versionSeleccionada?.id === v.id
                      ? "bg-brand-500 text-on-brand shadow-sm"
                      : "text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  Versión {v.numero_version}
                  {v.es_version_activa ? " (la actual)" : ""}
                </Link>
              ))}
            </div>
            {versionSeleccionada && (
              <Link
                href={`/produccion/pedidos/${id}/cambios?a=${versionSeleccionada.numero_version}`}
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                Ver qué cambió →
              </Link>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Planeación subió este pedido {versiones.length} veces. La versión actual es la que usa Producción.
          </p>
        </div>
      )}

      {versionSeleccionada?.cargas_archivo && (
        <details className="text-xs text-slate-500">
          <summary className="w-fit cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900">
            Datos del archivo
          </summary>
          <p className="mt-1">
            {versionSeleccionada.cargas_archivo.nombre_archivo} ·{" "}
            {versionSeleccionada.cargas_archivo.filas_exitosas ?? 0} filas cargadas ·{" "}
            {new Date(versionSeleccionada.created_at).toLocaleString("es-MX")}
          </p>
        </details>
      )}

      {!versionSeleccionada && (
        <p className="text-sm text-slate-600">Este pedido no tiene versiones.</p>
      )}

      {versionSeleccionada && items && items.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          Planeación todavía no ha liberado muebles de este PM. Aparecerán aquí en cuanto los libere.
        </p>
      )}

      {items && items.length > 0 && (
        <ItemsLiberacionTable
          items={items}
          pedidoId={id}
          puedeSolicitarEliminacion={puedeSolicitarEliminacion}
          puedeEliminarDefinitivo={puedeEliminarDefinitivo}
          situacionPorItem={situacionPorItem}
        />
      )}
    </main>
  );
}
