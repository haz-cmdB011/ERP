import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leer } from "@/lib/supabase/leer";
import { getBaseUrl } from "@/lib/site-url";
import { esUuid } from "@/lib/produccion/qr-viajero";
import { MAX_ETIQUETAS, etiquetasDeMuebles } from "@/lib/trazabilidad/etiquetas";
import ViajeroQr from "../viajero-qr";
import ImprimirButton from "../imprimir-button";

export const metadata: Metadata = { title: "Etiquetas QR" };

interface ItemEtiqueta {
  id: string;
  item_code: number;
  modelo: string | null;
  cantidad_total: number;
  unidad: string | null;
  fila_excel_origen: number | null;
}

// Etiquetas QR para pegar en el mueble (3 × 8 por hoja carta): el QR corto /q/<ítem>
// abre la ficha del mueble, igual que el de la hoja de viajero. Con ?ids= imprime los
// ítems elegidos en la tabla del pedido; sin ellos, todos los muebles liberados de la
// versión activa. ?por=pieza imprime una por pieza ("Pieza 3 de 7").
export default async function EtiquetasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ids?: string; por?: string }>;
}) {
  const { id } = await params;
  const { ids, por } = await searchParams;
  if (!esUuid(id)) notFound();
  const elegidos = (ids ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(esUuid);
  const porPieza = por === "pieza";

  const supabase = await createClient();
  const pedido = await leer(
    supabase
      .from("pedidos")
      .select("numero_pedido, proyectos ( nombre )")
      .eq("id", id)
      .maybeSingle<{ numero_pedido: string; proyectos: { nombre: string } | null }>(),
    "pedidos"
  );
  if (!pedido) notFound();

  // El filtro sobre la relación embebida evita mezclar ítems de otro pedido si alguien
  // edita la dirección a mano.
  let consulta = supabase
    .from("planeacion_items")
    .select("id, item_code, modelo, cantidad_total, unidad, fila_excel_origen, pedido_versiones!inner ( pedido_id, es_version_activa )")
    .eq("pedido_versiones.pedido_id", id);
  consulta =
    elegidos.length > 0
      ? consulta.in("id", elegidos)
      : consulta
          .eq("pedido_versiones.es_version_activa", true)
          .eq("tipo_registro", "MO")
          .eq("estado_liberacion", "enviado_a_produccion")
          .is("eliminacion_solicitada_en", null)
          .or("estado_revision.is.null,estado_revision.neq.cancelado");
  const items = await leer(consulta.order("fila_excel_origen").returns<ItemEtiqueta[]>(), "planeacion_items");
  if (!items || items.length === 0) notFound();

  const folios = await leer(
    supabase
      .from("folios_produccion")
      .select("planeacion_item_id, folio")
      .in(
        "planeacion_item_id",
        items.map((i) => i.id)
      )
      .returns<{ planeacion_item_id: string; folio: string }[]>(),
    "folios_produccion"
  );
  const folioPorItem = new Map((folios ?? []).map((f) => [f.planeacion_item_id, f.folio]));
  const itemPorId = new Map(items.map((i) => [i.id, i]));
  const { etiquetas, recortadas } = etiquetasDeMuebles(
    items.map((i) => ({ id: i.id, cantidad: Number(i.cantidad_total) })),
    porPieza
  );
  const baseUrl = await getBaseUrl();

  const otra = new URLSearchParams();
  if (elegidos.length > 0) otra.set("ids", elegidos.join(","));
  if (!porPieza) otra.set("por", "pieza");
  const hrefOtra = `/produccion/pedidos/${id}/etiquetas${otra.size ? `?${otra.toString()}` : ""}`;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Etiquetas QR — {pedido.numero_pedido}</h1>
          <p className="text-sm text-slate-600">
            {etiquetas.length} etiqueta(s) {porPieza ? "(una por pieza)" : "(una por mueble)"} · 24 por hoja carta.
            Al escanearlas se abre la ficha del mueble.
          </p>
          {recortadas > 0 && (
            <p className="mt-1 text-sm text-amber-700">
              Solo caben {MAX_ETIQUETAS} por impresión: faltan {recortadas}. Elige menos muebles en la tabla del pedido.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={hrefOtra}
            className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {porPieza ? "Una por mueble" : "Una por pieza"}
          </Link>
          <ImprimirButton sufijo={` (${etiquetas.length})`} />
        </div>
      </div>

      {/* Colores fijos: la etiqueta se imprime igual aunque la pantalla esté en modo oscuro. */}
      <ul className="grid grid-cols-2 sm:grid-cols-3 print:grid-cols-[repeat(3,63mm)] print:justify-center">
        {etiquetas.map((e) => {
          const item = itemPorId.get(e.itemId);
          if (!item) return null;
          const folio = folioPorItem.get(item.id);
          return (
            <li
              key={e.key}
              style={{ background: "#fff", color: "#000" }}
              className="flex items-center gap-2 border border-dashed border-gray-400 p-1.5 break-inside-avoid print:h-[30mm]"
            >
              <ViajeroQr value={`${baseUrl}/q/${item.id}`} size={92} />
              <div className="min-w-0 text-[10px] leading-tight">
                <p className="font-bold">{pedido.numero_pedido}</p>
                <p className="line-clamp-2 text-[12px] font-bold">{item.modelo ?? `Ítem ${item.item_code}`}</p>
                <p>
                  Ítem {item.item_code} · {Number(item.cantidad_total)} {item.unidad ?? ""}
                </p>
                {folio && <p className="font-mono">{folio}</p>}
                {e.pieza && (
                  <p className="font-semibold">
                    Pieza {e.pieza.n} de {e.pieza.de}
                  </p>
                )}
                <p className="truncate">{pedido.proyectos?.nombre}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
