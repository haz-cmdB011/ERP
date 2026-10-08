import Link from "next/link";
import { metadataPedido } from "@/lib/planeacion/titulo-pedido";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getImagenesConGrandePorItem } from "@/lib/planeacion/imagenes";
import { esUuid } from "@/lib/produccion/qr-viajero";
import { formatoFechaDMA } from "@/lib/resumen/entrega";
import { grupoDelItem } from "@/lib/calidad/estado-item";
import ItemsCalidadTable, { type ItemCalidadRow } from "./items-calidad-table";

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

interface ItemRow {
  id: string;
  item_code: number;
  tipo_registro: "MO" | "FU";
  tipo_material: string | null;
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  parent_item_id: string | null;
  fila_excel_origen: number | null;
  estado_liberacion: string;
  estado_revision: string | null;
  motivo_cancelacion: string | null;
  liberado_en: string | null;
}

interface InformeRow {
  id: string;
  folio: string;
  aprobado: boolean;
  planeacion_item_id: string;
  elaborado_en: string;
  descripcion: string | null;
  categoria: string | null;
}

export const generateMetadata = metadataPedido;

export default async function PedidoCalidadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; item?: string }>;
}) {
  const { id } = await params;
  const { version, item: itemParam } = await searchParams;
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
      "id, numero_pedido, fecha_pedido, fecha_entrega, estado, eliminado_en, cancelado_en, motivo_cancelacion, proyectos ( nombre, cliente )"
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      numero_pedido: string;
      fecha_pedido: string | null;
      fecha_entrega: string | null;
      estado: string;
      eliminado_en: string | null;
      cancelado_en: string | null;
      motivo_cancelacion: string | null;
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

  // Refleja is_calidad() del lado del servidor (ver migración
  // informes_calidad): solo controla qué botones se muestran — el permiso
  // real lo sigue exigiendo el RPC crear_informe_calidad en la base.
  const puedeEvaluar =
    perfil?.rol === "desarrollador" ||
    (perfil?.area === "calidad" && (perfil.rol === "administrador" || perfil.rol === "trabajador"));

  // Un pedido eliminado (papelera de Planeación) deja de existir para
  // Calidad — en cuanto se restaure desde Planeación, vuelve a aparecer
  // como un pedido normal sin ningún paso extra.
  if (!pedido || pedido.eliminado_en) {
    notFound();
  }

  const versionSeleccionada =
    (version && versiones?.find((v) => String(v.numero_version) === version)) ||
    versiones?.find((v) => v.es_version_activa) ||
    versiones?.[0] ||
    null;

  // Regla 1: solo se reflejan los ítems que ya se enviaron a producción.
  // Los cancelados SÍ se incluyen (a diferencia de antes): se muestran
  // marcados como "Cancelado" en vez de ocultarse, para no dejar un
  // pedido con historial de calidad pareciendo que nunca tuvo ítems.
  const itemsEnviados = versionSeleccionada
    ? await leer(
        supabase
        .from("planeacion_items")
        .select(
          "id, item_code, tipo_registro, tipo_material, modelo, descripcion, cantidad_total, unidad, parent_item_id, fila_excel_origen, estado_liberacion, estado_revision, motivo_cancelacion, liberado_en"
        )
        .eq("pedido_version_id", versionSeleccionada.id)
        .eq("estado_liberacion", "enviado_a_produccion")
        .order("fila_excel_origen")
        .returns<ItemRow[]>(),
        "planeacion_items"
      )
    : null;

  const items = itemsEnviados ?? [];
  const itemIds = items.map((i) => i.id);

  // Informes e imágenes de los ítems se piden a la vez.
  const [informes, imagenesPorItem] = await Promise.all([
    itemIds.length
      ? leer(
          supabase
            .from("informes_calidad")
            .select("id, folio, aprobado, planeacion_item_id, elaborado_en, descripcion, categoria")
            .in("planeacion_item_id", itemIds)
            .order("elaborado_en", { ascending: false })
            .returns<InformeRow[]>(),
          "informes_calidad"
        )
      : Promise.resolve([] as InformeRow[]),
    getImagenesConGrandePorItem(supabase, itemIds),
  ]);

  // Cada item_id agrupa su historial completo, ya ordenado desc (más
  // reciente primero) porque la consulta de arriba ordena por elaborado_en.
  const informesPorItem = new Map<string, InformeRow[]>();
  for (const inf of informes ?? []) {
    const lista = informesPorItem.get(inf.planeacion_item_id) ?? [];
    lista.push(inf);
    informesPorItem.set(inf.planeacion_item_id, lista);
  }

  const itemsConInforme: ItemCalidadRow[] = items.map((item) => ({
    id: item.id,
    item_code: item.item_code,
    tipo_registro: item.tipo_registro,
    tipo_material: item.tipo_material,
    modelo: item.modelo,
    descripcion: item.descripcion,
    cantidad_total: item.cantidad_total,
    unidad: item.unidad,
    parent_item_id: item.parent_item_id,
    liberadoEn: item.liberado_en,
    estadoRevision: item.estado_revision,
    motivoCancelacion: item.motivo_cancelacion,
    imagenUrl: imagenesPorItem.get(item.id)?.[0]?.url ?? null,
    imagenGrandeUrl: imagenesPorItem.get(item.id)?.[0]?.urlGrande ?? null,
    informes: (informesPorItem.get(item.id) ?? []).map((inf) => ({
      id: inf.id,
      folio: inf.folio,
      aprobado: inf.aprobado,
      elaborado_en: inf.elaborado_en,
      descripcion: inf.descripcion,
      categoria: inf.categoria,
    })),
  }));

  // Llegó escaneando el QR de un mueble: se muestra solo ese mueble (con sus
  // componentes) para evaluarlo sin buscarlo entre todo el pedido.
  const itemEnfocado = itemParam && esUuid(itemParam) ? itemParam : null;
  const grupoEnfocado = itemEnfocado ? grupoDelItem(itemsConInforme, itemEnfocado) : [];
  const enfoque = itemEnfocado !== null && grupoEnfocado.length > 0;
  const hrefTodoElPedido = `/calidad/pedidos/${id}${
    versionSeleccionada ? `?version=${versionSeleccionada.numero_version}` : ""
  }`;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {pedido.numero_pedido}
        </h1>
        <p className="text-sm text-slate-600">
          {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Entrega: {pedido.fecha_entrega ?? "—"}
        </p>
      </div>

      {pedido.cancelado_en && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
          <p className="font-medium text-rose-800">
            Este pedido fue cancelado el {formatoFechaDMA(pedido.cancelado_en)}
          </p>
          {pedido.motivo_cancelacion && (
            <p className="mt-1 text-rose-700">Motivo: {pedido.motivo_cancelacion}</p>
          )}
        </div>
      )}

      {versiones && versiones.length > 0 && (
        <div className="flex w-fit flex-wrap gap-1 rounded border border-slate-200 bg-slate-50 p-1 text-sm">
          {versiones.map((v) => (
            <Link
              key={v.id}
              href={`/calidad/pedidos/${id}?version=${v.numero_version}`}
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
      )}

      {!versionSeleccionada && (
        <p className="text-sm text-slate-600">Este pedido no tiene versiones.</p>
      )}

      {itemEnfocado && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          {enfoque
            ? "Mostrando el mueble que escaneaste."
            : "Ese mueble todavía no se ha enviado a producción en esta versión, así que no se puede evaluar."}
          <Link href={hrefTodoElPedido} className="font-medium underline-offset-2 hover:underline">
            Ver todo el pedido
          </Link>
          <Link href="/calidad/escanear" className="font-medium underline-offset-2 hover:underline">
            Escanear otro
          </Link>
        </p>
      )}

      {versionSeleccionada && (
        <ItemsCalidadTable
          items={enfoque ? grupoEnfocado : itemsConInforme}
          pedidoId={id}
          puedeEvaluar={puedeEvaluar}
        />
      )}
    </main>
  );
}
