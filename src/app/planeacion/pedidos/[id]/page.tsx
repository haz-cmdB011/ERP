import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarPlaneacion } from "@/lib/auth/get-perfil";
import { getImagenesPorItem } from "@/lib/planeacion/imagenes";
import type { EstadoRevision } from "@/lib/planeacion/estado-revision";
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

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, numero_pedido, fecha_pedido, fecha_entrega, estado, proyectos ( nombre, cliente )")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      numero_pedido: string;
      fecha_pedido: string | null;
      fecha_entrega: string | null;
      estado: string;
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
          "id, item_code, tipo_registro, tipo_material, modelo, descripcion, cantidad_x_mueble, unidad, cantidad_total, parent_item_id, fila_excel_origen, estado_revision"
        )
        .eq("pedido_version_id", versionSeleccionada.id)
        .order("fila_excel_origen")
        .returns<ItemRow[]>()
    : { data: null };

  const itemIds = (items ?? []).map((i) => i.id);
  const imagenesPorItem = await getImagenesPorItem(supabase, itemIds);

  const fuPorPadre = new Map<string, ItemRow[]>();
  for (const item of items ?? []) {
    if (item.tipo_registro === "FU" && item.parent_item_id) {
      const lista = fuPorPadre.get(item.parent_item_id) ?? [];
      lista.push(item);
      fuPorPadre.set(item.parent_item_id, lista);
    }
  }
  const muebles: MuebleTabla[] = (items ?? [])
    .filter((i) => i.tipo_registro === "MO")
    .map((m) => ({ ...m, hijos: fuPorPadre.get(m.id) ?? [] }));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <Link href="/planeacion" className="text-sm text-gray-500 underline">
          ← Pedidos
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{pedido.numero_pedido}</h1>
        <p className="text-sm text-gray-600">
          {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
        </p>
        <p className="text-xs text-gray-500">
          Entrega: {pedido.fecha_entrega ?? "—"}
        </p>
      </div>

      {versiones && versiones.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {versiones.map((v) => (
            <Link
              key={v.id}
              href={`/planeacion/pedidos/${id}?version=${v.numero_version}`}
              className={`rounded border px-3 py-1 ${
                versionSeleccionada?.id === v.id
                  ? "border-black bg-black text-white"
                  : "border-gray-300 text-gray-700"
              }`}
            >
              v{v.numero_version}
              {v.es_version_activa ? " (activa)" : ""}
            </Link>
          ))}
        </div>
      )}

      {versionSeleccionada?.cargas_archivo && (
        <p className="text-xs text-gray-500">
          Archivo: {versionSeleccionada.cargas_archivo.nombre_archivo} ·{" "}
          {versionSeleccionada.cargas_archivo.filas_exitosas ?? 0} filas
          ingeridas · {new Date(versionSeleccionada.created_at).toLocaleString()}
        </p>
      )}

      {!versionSeleccionada && (
        <p className="text-sm text-gray-600">Este pedido no tiene versiones.</p>
      )}

      {muebles.length > 0 && (
        <ItemsTabla
          muebles={muebles}
          imagenesPorItem={Object.fromEntries(imagenesPorItem)}
          puedeEditar={puedeEditar}
          filtroInicial={modelo ?? ""}
        />
      )}
    </main>
  );
}
