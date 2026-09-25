import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarPlaneacion } from "@/lib/auth/get-perfil";
import { getImagenesPorItem } from "@/lib/planeacion/imagenes";
import type { EstadoRevision } from "@/lib/planeacion/estado-revision";
import CancelarPedido from "./cancelar-pedido";
import ItemsTabla, { type MuebleTabla } from "./items-tabla";

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
  cantidad_x_mueble: number | null;
  unidad: string | null;
  cantidad_total: number;
  parent_item_id: string | null;
  fila_excel_origen: number | null;
  estado_revision: EstadoRevision;
  motivo_cancelacion: string | null;
  eliminacion_solicitada_en: string | null;
}

export default async function PedidoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; modelo?: string }>;
}) {
  const { id } = await params;
  const { version, modelo } = await searchParams;
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const puedeEditar = puedeEditarPlaneacion(perfil);
  // Enviar un ítem a la papelera lo puede hacer quien edita en Planeación (la
  // eliminación definitiva sigue siendo de los administradores de Producción).
  const puedeEliminar = puedeEditar;

  const { data: pedido } = await supabase
    .from("pedidos")
    .select(
      "id, numero_pedido, fecha_pedido, fecha_entrega, estado, cancelado_en, motivo_cancelacion, proyectos ( nombre, cliente )"
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      numero_pedido: string;
      fecha_pedido: string | null;
      fecha_entrega: string | null;
      estado: string;
      cancelado_en: string | null;
      motivo_cancelacion: string | null;
      proyectos: { nombre: string; cliente: string } | null;
    }>();

  if (!pedido) {
    notFound();
  }

  const { data: versiones } = await supabase
    .from("pedido_versiones")
    .select(
      "id, numero_version, es_version_activa, notas, created_at, cargas_archivo:carga_id ( nombre_archivo, filas_totales, filas_exitosas, estado )"
    )
    .eq("pedido_id", id)
    .order("numero_version", { ascending: false })
    .returns<VersionRow[]>();

  const versionSeleccionada =
    (version && versiones?.find((v) => String(v.numero_version) === version)) ||
    versiones?.find((v) => v.es_version_activa) ||
    versiones?.[0] ||
    null;

  const { data: items } = versionSeleccionada
    ? await supabase
        .from("planeacion_items")
        .select(
          "id, item_code, tipo_registro, tipo_material, modelo, descripcion, cantidad_x_mueble, unidad, cantidad_total, parent_item_id, fila_excel_origen, estado_revision, motivo_cancelacion, eliminacion_solicitada_en"
        )
        .eq("pedido_version_id", versionSeleccionada.id)
        .order("fila_excel_origen")
        .returns<ItemRow[]>()
    : { data: null };

  const itemIds = (items ?? []).map((i) => i.id);
  const imagenesPorItem = await getImagenesPorItem(supabase, itemIds);

  // Los ítems cancelados o enviados a la papelera de Producción salen de la
  // vista normal: los cancelados viven en /planeacion/cancelados, y los de
  // papelera se gestionan desde la Papelera de Producción.
  const itemsVisibles = (items ?? []).filter(
    (i) => i.estado_revision !== "cancelado" && !i.eliminacion_solicitada_en
  );

  const mo = itemsVisibles.filter((i) => i.tipo_registro === "MO");
  const idsMoVisibles = new Set(mo.map((m) => m.id));
  const fuPorPadre = new Map<string, ItemRow[]>();
  for (const item of itemsVisibles) {
    if (item.tipo_registro === "FU" && item.parent_item_id && idsMoVisibles.has(item.parent_item_id)) {
      const lista = fuPorPadre.get(item.parent_item_id) ?? [];
      lista.push(item);
      fuPorPadre.set(item.parent_item_id, lista);
    }
  }
  // FU cuyo MO padre se ocultó (cancelado o en papelera) pero que el FU en
  // sí sigue activo: no se pierden, se muestran aparte en vez de quedar
  // huérfanos sin ningún lugar donde verse.
  const fuSueltos = itemsVisibles.filter(
    (i) => i.tipo_registro === "FU" && (!i.parent_item_id || !idsMoVisibles.has(i.parent_item_id))
  );

  // Los sueltos van al final como filas sin hijos, para que también
  // entren en el filtro por modelo.
  const muebles: MuebleTabla[] = [
    ...mo.map((m) => ({ ...m, hijos: fuPorPadre.get(m.id) ?? [] })),
    ...fuSueltos.map((f) => ({ ...f, hijos: [] })),
  ];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="border-b border-slate-200 pb-4">
        <Link
          href="/planeacion"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600"
        >
          ← Pedidos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {pedido.numero_pedido}
        </h1>
        <p className="text-sm text-slate-600">
          {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Entrega: {pedido.fecha_entrega ?? "—"}
        </p>
      </div>

      <CancelarPedido
        pedidoId={id}
        cancelacion={{ cancelado_en: pedido.cancelado_en, motivo_cancelacion: pedido.motivo_cancelacion }}
        puedeEditar={puedeEditar}
      />

      {versiones && versiones.length > 0 && (
        <div className="flex w-fit flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 text-sm">
          {versiones.map((v) => (
            <Link
              key={v.id}
              href={`/planeacion/pedidos/${id}?version=${v.numero_version}`}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                versionSeleccionada?.id === v.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              v{v.numero_version}
              {v.es_version_activa ? " (activa)" : ""}
            </Link>
          ))}
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

      {muebles.length > 0 && (
        <ItemsTabla
          muebles={muebles}
          imagenesPorItem={Object.fromEntries(imagenesPorItem)}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          filtroInicial={modelo ?? ""}
        />
      )}
    </main>
  );
}
