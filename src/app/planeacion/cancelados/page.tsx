import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarPlaneacion } from "@/lib/auth/get-perfil";
import { RevertirItemBoton, RevertirPedidoBoton } from "@/components/revertir-cancelacion";

interface PedidoRow {
  id: string;
  numero_pedido: string;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  proyectos: { nombre: string; cliente: string } | null;
  pedido_versiones: { id: string; numero_version: number; es_version_activa: boolean }[];
}

interface ItemEstadoRow {
  id: string;
  item_code: number;
  modelo: string | null;
  tipo_material: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  pedido_version_id: string;
  estado_revision: string | null;
  motivo_cancelacion: string | null;
}

interface InformeRow {
  planeacion_item_id: string;
  folio: string;
  elaborado_en: string;
}

interface ItemCancelado {
  id: string;
  item_code: number;
  modelo: string | null;
  tipo_material: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  motivo: string | null;
  folio: string | null;
}

interface PedidoConConteo {
  id: string;
  numero_pedido: string;
  proyecto: string;
  cliente: string;
  cancelado_en: string | null;
  motivoCancelacionPedido: string | null;
  totalItems: number;
  itemsCancelados: number;
  items: ItemCancelado[];
}

// Duplicado a propósito en Producción (src/app/produccion/cancelados/page.tsx)
// en vez de compartir un módulo entre áreas — mismo criterio ya usado para
// Calidad, para no acoplar Planeación/Producción entre sí.
export default async function CanceladosPlaneacionPage() {
  const supabase = await createClient();
  // Revertir una cancelación es una acción de Planeación (is_planeacion()).
  const puedeRevertir = puedeEditarPlaneacion(await getPerfilActual(supabase));

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select(
      "id, numero_pedido, cancelado_en, motivo_cancelacion, proyectos ( nombre, cliente ), pedido_versiones ( id, numero_version, es_version_activa )"
    )
    .is("eliminado_en", null)
    .order("created_at", { ascending: false })
    .returns<PedidoRow[]>();

  const versionPorPedido = new Map<string, string>();
  for (const p of pedidos ?? []) {
    const activa =
      p.pedido_versiones.find((v) => v.es_version_activa) ??
      [...p.pedido_versiones].sort((a, b) => b.numero_version - a.numero_version)[0];
    if (activa) versionPorPedido.set(p.id, activa.id);
  }
  const versionIds = Array.from(versionPorPedido.values());

  const { data: itemsEstado } = versionIds.length
    ? await supabase
        .from("planeacion_items")
        .select(
          "id, item_code, modelo, tipo_material, descripcion, cantidad_total, unidad, pedido_version_id, estado_revision, motivo_cancelacion"
        )
        .in("pedido_version_id", versionIds)
        .returns<ItemEstadoRow[]>()
    : { data: [] as ItemEstadoRow[] };

  const itemsCanceladosIds = (itemsEstado ?? [])
    .filter((i) => i.estado_revision === "cancelado")
    .map((i) => i.id);

  // Folio de Calidad conservado para cada ítem cancelado (si ya fue
  // evaluado antes de cancelarse) — eliminar_item_definitivo ya no borra
  // estos ítems para no perder el folio, así que aquí se le da seguimiento.
  const { data: informes } = itemsCanceladosIds.length
    ? await supabase
        .from("informes_calidad")
        .select("planeacion_item_id, folio, elaborado_en")
        .in("planeacion_item_id", itemsCanceladosIds)
        .order("elaborado_en", { ascending: false })
        .returns<InformeRow[]>()
    : { data: [] as InformeRow[] };

  const folioPorItem = new Map<string, string>();
  for (const inf of informes ?? []) {
    if (!folioPorItem.has(inf.planeacion_item_id)) {
      folioPorItem.set(inf.planeacion_item_id, inf.folio);
    }
  }

  const conteoPorVersion = new Map<string, { total: number; cancelados: number; items: ItemCancelado[] }>();
  for (const item of itemsEstado ?? []) {
    const c = conteoPorVersion.get(item.pedido_version_id) ?? { total: 0, cancelados: 0, items: [] };
    c.total += 1;
    if (item.estado_revision === "cancelado") {
      c.cancelados += 1;
      c.items.push({
        id: item.id,
        item_code: item.item_code,
        modelo: item.modelo,
        tipo_material: item.tipo_material,
        descripcion: item.descripcion,
        cantidad_total: item.cantidad_total,
        unidad: item.unidad,
        motivo: item.motivo_cancelacion,
        folio: folioPorItem.get(item.id) ?? null,
      });
    }
    conteoPorVersion.set(item.pedido_version_id, c);
  }

  const pedidosConConteo: PedidoConConteo[] = (pedidos ?? []).map((p) => {
    const versionId = versionPorPedido.get(p.id);
    const conteo = versionId
      ? (conteoPorVersion.get(versionId) ?? { total: 0, cancelados: 0, items: [] })
      : { total: 0, cancelados: 0, items: [] };
    return {
      id: p.id,
      numero_pedido: p.numero_pedido,
      proyecto: p.proyectos?.nombre ?? "—",
      cliente: p.proyectos?.cliente ?? "—",
      cancelado_en: p.cancelado_en,
      motivoCancelacionPedido: p.motivo_cancelacion,
      totalItems: conteo.total,
      itemsCancelados: conteo.cancelados,
      items: conteo.items,
    };
  });

  const totalmenteCancelados = pedidosConConteo.filter(
    (p) => p.cancelado_en !== null || (p.totalItems > 0 && p.itemsCancelados === p.totalItems)
  );
  const parcialmenteCancelados = pedidosConConteo.filter(
    (p) => p.cancelado_en === null && p.itemsCancelados > 0 && p.itemsCancelados < p.totalItems
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <h1 className="border-b border-slate-200 pb-4 text-2xl font-semibold tracking-tight text-slate-900">Cancelados</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-slate-600">
          PM cancelados totalmente ({totalmenteCancelados.length})
        </h2>
        {totalmenteCancelados.length === 0 ? (
          <p className="text-sm text-slate-500">No hay pedidos cancelados totalmente.</p>
        ) : (
          totalmenteCancelados.map((p) => (
            <PedidoCancelado
              key={p.id}
              pedido={p}
              puedeRevertir={puedeRevertir}
              etiquetaRevertir="Reactivar pedido"
              href={`/planeacion/pedidos/${p.id}`}
              encabezado={
                p.cancelado_en
                  ? `Motivo: ${p.motivoCancelacionPedido ?? "—"} · Cancelado el ${new Date(
                      p.cancelado_en
                    ).toLocaleDateString("es-MX")}`
                  : "Todos los ítems cancelados"
              }
            />
          ))
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-slate-600">
          PM con ítems cancelados — parcial ({parcialmenteCancelados.length})
        </h2>
        {parcialmenteCancelados.length === 0 ? (
          <p className="text-sm text-slate-500">No hay pedidos con cancelación parcial.</p>
        ) : (
          parcialmenteCancelados.map((p) => (
            <PedidoCancelado
              key={p.id}
              pedido={p}
              puedeRevertir={puedeRevertir}
              etiquetaRevertir="Revertir todos"
              href={`/planeacion/pedidos/${p.id}`}
              encabezado={`${p.itemsCancelados} de ${p.totalItems} ítems cancelados`}
            />
          ))
        )}
      </section>
    </main>
  );
}

function PedidoCancelado({
  pedido,
  href,
  encabezado,
  puedeRevertir,
  etiquetaRevertir,
}: {
  pedido: PedidoConConteo;
  href: string;
  encabezado: string;
  puedeRevertir: boolean;
  etiquetaRevertir: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-3">
        <div>
          <Link href={href} className="font-medium text-slate-900 hover:text-indigo-600 hover:underline">
            {pedido.numero_pedido}
          </Link>
          <p className="text-sm text-slate-600">
            {pedido.proyecto} — {pedido.cliente}
          </p>
          <p className="mt-1 text-xs text-slate-500">{encabezado}</p>
        </div>
        {puedeRevertir && <RevertirPedidoBoton pedidoId={pedido.id} etiqueta={etiquetaRevertir} />}
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">Modelo</th>
            <th className="px-3 py-2">Material</th>
            <th className="px-3 py-2">Descripción</th>
            <th className="px-3 py-2">Cant.</th>
            <th className="px-3 py-2">Motivo</th>
            <th className="px-3 py-2">Folio</th>
            {puedeRevertir && <th className="px-3 py-2"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pedido.items.map((it) => (
            <tr key={it.id}>
              <td className="px-3 py-2 font-medium text-slate-900">{it.item_code}</td>
              <td className="px-3 py-2">{it.modelo ?? "—"}</td>
              <td className="px-3 py-2">{it.tipo_material ?? "—"}</td>
              <td className="px-3 py-2">{it.descripcion ?? "—"}</td>
              <td className="px-3 py-2">
                {it.cantidad_total} {it.unidad}
              </td>
              <td className="px-3 py-2">{it.motivo ?? "—"}</td>
              <td className="px-3 py-2">{it.folio ?? "—"}</td>
              {puedeRevertir && (
                <td className="px-3 py-2">
                  <RevertirItemBoton itemId={it.id} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
