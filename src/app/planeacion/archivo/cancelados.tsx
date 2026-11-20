import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarPlaneacion } from "@/lib/auth/get-perfil";
import EstadoVacio from "@/components/estado-vacio";
import { RevertirItemBoton, RevertirPedidoBoton } from "@/components/revertir-cancelacion";

import { cargarCancelados, enLotes } from "@/lib/planeacion/cancelados-db";
import { paginarTodo } from "@/lib/supabase/paginar";

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
  // Se eliminó definitivamente pero se conservó por sus folios de Calidad:
  // ya no se reactiva.
  eliminadoDefinitivo: boolean;
  totalItems: number;
  itemsCancelados: number;
  items: ItemCancelado[];
}

// Contenido de la pestaña Cancelados de Archivo. Duplicado a propósito en Producción (src/app/produccion/cancelados/page.tsx)
// en vez de compartir un módulo entre áreas — mismo criterio ya usado para
// Calidad, para no acoplar Planeación/Producción entre sí.
export default async function CanceladosContenido() {
  const supabase = await createClient();
  // Revertir una cancelación es una acción de Planeación (is_planeacion()).
  const puedeRevertir = puedeEditarPlaneacion(await getPerfilActual(supabase));

  // Solo los pedidos con algo cancelado y sus muebles (no todos los PM): con cientos de PM, leer todo fallaba o
  // quedaba incompleto. Lanza si una lectura falla.
  const { pedidos, versionPorPedido, itemsEstado } = await cargarCancelados(supabase);

  const itemsCanceladosIds = (itemsEstado ?? [])
    .filter((i) => i.estado_revision === "cancelado")
    .map((i) => i.id);

  // Folio de Calidad conservado para cada ítem cancelado (si ya fue
  // evaluado antes de cancelarse) — eliminar_item_definitivo ya no borra
  // estos ítems para no perder el folio, así que aquí se le da seguimiento.
  const informes: InformeRow[] = [];
  for (const lote of enLotes(itemsCanceladosIds)) {
    informes.push(
      ...(await paginarTodo<InformeRow>(
        (desde, hasta) =>
          supabase
            .from("informes_calidad")
            .select("planeacion_item_id, folio, elaborado_en")
            .in("planeacion_item_id", lote)
            .order("elaborado_en", { ascending: false })
            .order("id")
            .range(desde, hasta)
            .returns<InformeRow[]>(),
        { contexto: "los folios de los muebles cancelados" }
      ))
    );
  }

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
      eliminadoDefinitivo: p.eliminado_definitivo_en !== null,
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
    <div className="flex flex-col gap-8">
      <p className="max-w-2xl text-sm text-slate-600">
        Pedidos y muebles que se cancelaron, con su motivo. Nada se pierde: se pueden reactivar cuando haga falta.
      </p>

      {totalmenteCancelados.length === 0 && parcialmenteCancelados.length === 0 && (
        <EstadoVacio
          titulo="No hay nada cancelado"
          descripcion="Cuando canceles un pedido completo o algunos de sus muebles, aparecerá aquí."
          accion={{ href: "/planeacion", etiqueta: "Volver a Pedidos" }}
        />
      )}

      {totalmenteCancelados.length > 0 && (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">
              Pedidos cancelados completos ({totalmenteCancelados.length})
            </h2>
            <p className="text-sm text-slate-500">Se canceló el pedido entero.</p>
          </div>
          {totalmenteCancelados.map((p) => (
            <PedidoCancelado
              key={p.id}
              pedido={p}
              puedeRevertir={puedeRevertir && !p.eliminadoDefinitivo}
              etiquetaRevertir="Reactivar pedido"
              href={`/planeacion/pedidos/${p.id}`}
              encabezado={
                p.eliminadoDefinitivo
                  ? "Eliminado definitivamente · se conserva solo por sus folios de Calidad"
                  : p.cancelado_en
                  ? `Motivo: ${p.motivoCancelacionPedido ?? "—"} · Cancelado el ${new Date(
                      p.cancelado_en
                    ).toLocaleDateString("es-MX")}`
                  : "Todos los ítems cancelados"
              }
            />
          ))}
        </section>
      )}

      {parcialmenteCancelados.length > 0 && (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">
              Pedidos con algunos muebles cancelados ({parcialmenteCancelados.length})
            </h2>
            <p className="text-sm text-slate-500">El pedido sigue vigente; solo se canceló una parte.</p>
          </div>
          {parcialmenteCancelados.map((p) => (
            <PedidoCancelado
              key={p.id}
              pedido={p}
              puedeRevertir={puedeRevertir}
              etiquetaRevertir="Revertir todos"
              href={`/planeacion/pedidos/${p.id}`}
              encabezado={`${p.itemsCancelados} de ${p.totalItems} ítems cancelados`}
            />
          ))}
        </section>
      )}
    </div>
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
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-3">
        <div>
          <Link href={href} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">
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
          <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
