import Link from "next/link";
import { metadataPedido } from "@/lib/planeacion/titulo-pedido";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getImagenesConGrandePorItem } from "@/lib/planeacion/imagenes";
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
      "id, numero_pedido, fecha_pedido, fecha_entrega, estado, eliminado_en, proyectos ( nombre, cliente )"
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      numero_pedido: string;
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

  // Folio único de producción de cada ítem (se asigna al liberarlo y no cambia).
  const idsItems = (itemsBase ?? []).map((i) => i.id);
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

  const items: ItemLiberacionRow[] | null = itemsBase
    ? itemsBase.map((i) => ({
        ...i,
        folio: folioPorItem.get(i.id) ?? null,
        imagenUrl: imagenesPorItem.get(i.id)?.[0]?.url ?? null,
        imagenGrandeUrl: imagenesPorItem.get(i.id)?.[0]?.urlGrande ?? null,
      }))
    : null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {pedido.numero_pedido}
        </h1>
        <p className="text-sm text-slate-600">
          {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-500">
            Entrega: {pedido.fecha_entrega ?? "—"}
          </p>
          <Link
            href={`/produccion/pedidos/${id}/asignaciones`}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400"
          >
            Asignar a equipos
          </Link>
        </div>
      </div>

      {versiones && versiones.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-fit flex-wrap gap-1 rounded border border-slate-200 bg-slate-50 p-1 text-sm">
            {versiones.map((v) => (
              <Link
                key={v.id}
                href={`/produccion/pedidos/${id}?version=${v.numero_version}`}
                className={`rounded px-3 py-1 font-medium transition-colors ${
                  versionSeleccionada?.id === v.id
                    ? "bg-brand-500 text-on-brand shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                v{v.numero_version}
                {v.es_version_activa ? " (activa)" : ""}
              </Link>
            ))}
          </div>
          {versiones.length > 1 && versionSeleccionada && (
            <Link
              href={`/produccion/pedidos/${id}/cambios?a=${versionSeleccionada.numero_version}`}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Ver qué cambió entre versiones →
            </Link>
          )}
        </div>
      )}

      {versionSeleccionada?.cargas_archivo && (
        <p className="text-xs text-slate-500">
          Archivo: {versionSeleccionada.cargas_archivo.nombre_archivo} ·{" "}
          {versionSeleccionada.cargas_archivo.filas_exitosas ?? 0} filas
          ingeridas · {new Date(versionSeleccionada.created_at).toLocaleString()}
        </p>
      )}

      {!versionSeleccionada && (
        <p className="text-sm text-slate-600">Este pedido no tiene versiones.</p>
      )}

      {items && items.length > 0 && (
        <ItemsLiberacionTable
          items={items}
          pedidoId={id}
          puedeSolicitarEliminacion={puedeSolicitarEliminacion}
          puedeEliminarDefinitivo={puedeEliminarDefinitivo}
        />
      )}
    </main>
  );
}
