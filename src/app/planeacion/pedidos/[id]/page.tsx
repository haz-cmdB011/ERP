import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
}

export default async function PedidoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  const { version } = await searchParams;
  const supabase = await createClient();

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
          "id, item_code, tipo_registro, tipo_material, modelo, descripcion, cantidad_x_mueble, unidad, cantidad_total, parent_item_id, fila_excel_origen"
        )
        .eq("pedido_version_id", versionSeleccionada.id)
        .order("fila_excel_origen")
        .returns<ItemRow[]>()
    : { data: null };

  const mo = items?.filter((i) => i.tipo_registro === "MO") ?? [];
  const fuPorPadre = new Map<string, ItemRow[]>();
  for (const item of items ?? []) {
    if (item.tipo_registro === "FU" && item.parent_item_id) {
      const lista = fuPorPadre.get(item.parent_item_id) ?? [];
      lista.push(item);
      fuPorPadre.set(item.parent_item_id, lista);
    }
  }

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

      {mo.length > 0 && (
        <div className="flex flex-col gap-4">
          {mo.map((m) => (
            <div key={m.id} className="rounded border border-gray-200 p-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">
                  {m.item_code} — {m.descripcion}
                </span>
                <span className="text-gray-500">
                  {m.cantidad_total} {m.unidad}
                </span>
              </div>
              <p className="text-xs text-gray-500">{m.modelo}</p>

              {(fuPorPadre.get(m.id) ?? []).length > 0 && (
                <table className="mt-2 w-full text-left text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="py-1 pr-2">Item</th>
                      <th className="py-1 pr-2">Material</th>
                      <th className="py-1 pr-2">Descripción</th>
                      <th className="py-1 pr-2">Cant.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fuPorPadre.get(m.id) ?? []).map((f) => (
                      <tr key={f.id} className="border-t border-gray-100">
                        <td className="py-1 pr-2">{f.item_code}</td>
                        <td className="py-1 pr-2">{f.tipo_material}</td>
                        <td className="py-1 pr-2">
                          {f.descripcion?.split("\n")[0]}
                        </td>
                        <td className="py-1 pr-2">
                          {f.cantidad_total} {f.unidad}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
