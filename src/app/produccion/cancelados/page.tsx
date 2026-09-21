import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getPerfilActual,
  puedeAdministrarPlaneacion,
  puedeEditarPlaneacion,
} from "@/lib/auth/get-perfil";
import {
  RestaurarItemBoton,
  RestaurarPedidoBoton,
  RevertirItemBoton,
  RevertirPedidoBoton,
} from "@/components/revertir-cancelacion";

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

interface ItemPapeleraRow {
  id: string;
  item_code: number;
  modelo: string | null;
  tipo_material: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  pedido_version_id: string;
  eliminacion_solicitada_en: string;
}

interface PedidoEliminadoRow {
  id: string;
  numero_pedido: string;
  eliminado_en: string;
  proyectos: { nombre: string; cliente: string } | null;
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

// Duplicado a propósito de Planeación (src/app/planeacion/cancelados/page.tsx)
// en vez de compartir un módulo entre áreas — mismo criterio ya usado para
// Calidad, para no acoplar Planeación/Producción entre sí. Aquí Producción ve
// lo cancelado Y lo eliminado (ítems en papelera y PM eliminados) y lo puede
// revertir según su permiso real: ítems (revertir/restaurar) → Producción o
// Planeación; reactivar un pedido → Planeación; restaurar un PM eliminado →
// administrador de Planeación o desarrollador.
export default async function CanceladosProduccionPage() {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const esProduccion =
    perfil?.rol === "desarrollador" ||
    (perfil?.area === "produccion" && (perfil.rol === "administrador" || perfil.rol === "trabajador"));
  const puedeReactivarPedido = puedeEditarPlaneacion(perfil);
  const puedeRevertirItem = puedeReactivarPedido || esProduccion;
  const puedeRestaurarPedido = puedeAdministrarPlaneacion(perfil);

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

  // Ítems eliminados (papelera): mismo criterio de versión que arriba.
  const { data: itemsPapelera } = versionIds.length
    ? await supabase
        .from("planeacion_items")
        .select(
          "id, item_code, modelo, tipo_material, descripcion, cantidad_total, unidad, pedido_version_id, eliminacion_solicitada_en"
        )
        .in("pedido_version_id", versionIds)
        .not("eliminacion_solicitada_en", "is", null)
        .order("eliminacion_solicitada_en", { ascending: false })
        .returns<ItemPapeleraRow[]>()
    : { data: [] as ItemPapeleraRow[] };

  const pedidoPorVersion = new Map<string, string>();
  for (const [pedidoId, versionId] of versionPorPedido) pedidoPorVersion.set(versionId, pedidoId);
  const papeleraPorPedido = new Map<string, ItemPapeleraRow[]>();
  for (const it of itemsPapelera ?? []) {
    const pedidoId = pedidoPorVersion.get(it.pedido_version_id);
    if (!pedidoId) continue;
    const lista = papeleraPorPedido.get(pedidoId) ?? [];
    lista.push(it);
    papeleraPorPedido.set(pedidoId, lista);
  }
  const pedidosConPapelera = (pedidos ?? []).filter((p) => papeleraPorPedido.has(p.id));

  // PM eliminados (papelera de pedidos de Planeación).
  const { data: pedidosEliminados } = await supabase
    .from("pedidos")
    .select("id, numero_pedido, eliminado_en, proyectos ( nombre, cliente )")
    .not("eliminado_en", "is", null)
    .order("eliminado_en", { ascending: false })
    .returns<PedidoEliminadoRow[]>();

  const totalmenteCancelados = pedidosConConteo.filter(
    (p) => p.cancelado_en !== null || (p.totalItems > 0 && p.itemsCancelados === p.totalItems)
  );
  const parcialmenteCancelados = pedidosConConteo.filter(
    (p) => p.cancelado_en === null && p.itemsCancelados > 0 && p.itemsCancelados < p.totalItems
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <h1 className="border-b border-slate-200 pb-4 text-2xl font-semibold tracking-tight text-slate-900">Cancelados y eliminados</h1>

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
              puedeReactivarPedido={puedeReactivarPedido}
              puedeRevertirItem={puedeRevertirItem}
              etiquetaRevertir="Reactivar pedido"
              href={`/produccion/pedidos/${p.id}`}
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
              puedeReactivarPedido={puedeReactivarPedido}
              puedeRevertirItem={puedeRevertirItem}
              etiquetaRevertir="Revertir todos"
              href={`/produccion/pedidos/${p.id}`}
              encabezado={`${p.itemsCancelados} de ${p.totalItems} ítems cancelados`}
            />
          ))
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-slate-600">
          Ítems eliminados — papelera ({(itemsPapelera ?? []).length})
        </h2>
        {pedidosConPapelera.length === 0 ? (
          <p className="text-sm text-slate-500">No hay ítems eliminados.</p>
        ) : (
          pedidosConPapelera.map((p) => (
            <div key={p.id} className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 p-3">
                <Link href={`/produccion/pedidos/${p.id}`} className="font-medium text-slate-900 hover:text-indigo-600 hover:underline">
                  {p.numero_pedido}
                </Link>
                <p className="text-sm text-slate-600">
                  {p.proyectos?.nombre ?? "—"} — {p.proyectos?.cliente ?? "—"}
                </p>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Modelo</th>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Descripción</th>
                    <th className="px-3 py-2">Cant.</th>
                    <th className="px-3 py-2">Eliminado el</th>
                    {puedeRevertirItem && <th className="px-3 py-2"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(papeleraPorPedido.get(p.id) ?? []).map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 font-medium text-slate-900">{it.item_code}</td>
                      <td className="px-3 py-2">{it.modelo ?? "—"}</td>
                      <td className="px-3 py-2">{it.tipo_material ?? "—"}</td>
                      <td className="px-3 py-2">{it.descripcion ?? "—"}</td>
                      <td className="px-3 py-2">
                        {it.cantidad_total} {it.unidad}
                      </td>
                      <td className="px-3 py-2">
                        {new Date(it.eliminacion_solicitada_en).toLocaleDateString("es-MX")}
                      </td>
                      {puedeRevertirItem && (
                        <td className="px-3 py-2">
                          <RestaurarItemBoton itemId={it.id} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-slate-600">
          PM eliminados ({(pedidosEliminados ?? []).length})
        </h2>
        {(pedidosEliminados ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No hay pedidos eliminados.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Pedido</th>
                <th className="py-2 pr-4">Proyecto</th>
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4">Eliminado el</th>
                {puedeRestaurarPedido && <th className="py-2 pr-4"></th>}
              </tr>
            </thead>
            <tbody>
              {(pedidosEliminados ?? []).map((p) => (
                <tr key={p.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-4 font-medium text-slate-900">{p.numero_pedido}</td>
                  <td className="py-2 pr-4">{p.proyectos?.nombre ?? "—"}</td>
                  <td className="py-2 pr-4">{p.proyectos?.cliente ?? "—"}</td>
                  <td className="py-2 pr-4">{new Date(p.eliminado_en).toLocaleDateString("es-MX")}</td>
                  {puedeRestaurarPedido && (
                    <td className="py-2 pr-4">
                      <RestaurarPedidoBoton pedidoId={p.id} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function PedidoCancelado({
  pedido,
  href,
  encabezado,
  puedeReactivarPedido,
  puedeRevertirItem,
  etiquetaRevertir,
}: {
  pedido: PedidoConConteo;
  href: string;
  encabezado: string;
  puedeReactivarPedido: boolean;
  puedeRevertirItem: boolean;
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
        {puedeReactivarPedido && (
          <RevertirPedidoBoton pedidoId={pedido.id} etiqueta={etiquetaRevertir} />
        )}
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
            {puedeRevertirItem && <th className="px-3 py-2"></th>}
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
              {puedeRevertirItem && (
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
