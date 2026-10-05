import Link from "next/link";
import { CLASE_MIGA, FlechaRegresar } from "@/components/regresar-estilo";
import { metadataPedido } from "@/lib/planeacion/titulo-pedido";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarPlaneacion } from "@/lib/auth/get-perfil";
import { getImagenesPorItem } from "@/lib/planeacion/imagenes";
import type { EstadoRevision } from "@/lib/planeacion/estado-revision";
import CancelarPedido from "./cancelar-pedido";
import ItemsTabla, { type MuebleTabla } from "./items-tabla";
import { normalizarNumeroPM } from "@/lib/planeacion/numero-pm";
import { getPlanosPorItem } from "@/lib/planos/planos-por-item";

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

export const generateMetadata = metadataPedido;

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
      "id, numero_pedido, orden_trabajo, fecha_pedido, fecha_entrega, estado, cancelado_en, motivo_cancelacion, eliminado_definitivo_en, proyectos ( nombre, cliente )"
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      numero_pedido: string;
      orden_trabajo: string | null;
      fecha_pedido: string | null;
      fecha_entrega: string | null;
      estado: string;
      cancelado_en: string | null;
      motivo_cancelacion: string | null;
      eliminado_definitivo_en: string | null;
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
  const [imagenesPorItem, planosPorItem] = await Promise.all([
    getImagenesPorItem(supabase, itemIds),
    getPlanosPorItem(
      supabase,
      // Los planos se registran por OT ("PM134-26"), sin el número de PM
      // dentro de la OT: 1PM134-26 y 2PM134-26 ven los mismos planos.
      pedido.orden_trabajo
        ? `PM${pedido.orden_trabajo}`
        : normalizarNumeroPM(pedido.numero_pedido, { fechaPedido: pedido.fecha_pedido }),
      items ?? []
    ),
  ]);

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
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {pedido.numero_pedido}
        </h1>
        {pedido.orden_trabajo && (
          <p>
            <Link
              href={`/planeacion/ot/${encodeURIComponent(pedido.orden_trabajo)}`}
              className={CLASE_MIGA}
            >
              <FlechaRegresar className="h-4 w-4" />
              O.T. <span className="font-mono">{pedido.orden_trabajo}</span>
            </Link>
          </p>
        )}
        <p className="text-sm text-slate-600">
          {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Entrega: {pedido.fecha_entrega ?? "—"}
        </p>
      </div>

      <CancelarPedido
        pedidoId={id}
        cancelacion={{
          cancelado_en: pedido.cancelado_en,
          motivo_cancelacion: pedido.motivo_cancelacion,
          eliminado_definitivo_en: pedido.eliminado_definitivo_en,
        }}
        puedeEditar={puedeEditar}
      />

      {versiones && versiones.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-fit flex-wrap gap-1 rounded border border-slate-200 bg-slate-50 p-1 text-sm">
            {versiones.map((v) => (
              <Link
                key={v.id}
                href={`/planeacion/pedidos/${id}?version=${v.numero_version}`}
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
              href={`/planeacion/pedidos/${id}/cambios?a=${versionSeleccionada.numero_version}`}
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

      {muebles.length > 0 && (
        <ItemsTabla
          muebles={muebles}
          imagenesPorItem={Object.fromEntries(imagenesPorItem)}
          planosPorItem={planosPorItem}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          filtroInicial={modelo ?? ""}
        />
      )}
    </main>
  );
}
