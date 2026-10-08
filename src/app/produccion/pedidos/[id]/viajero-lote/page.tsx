import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/site-url";
import { getImagenesPorItem } from "@/lib/planeacion/imagenes";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";
import ViajeroFicha, {
  type ViajeroFichaItem,
  type ViajeroFichaPadre,
  type ViajeroFichaPedido,
} from "../viajero-ficha";
import ImprimirButton from "../imprimir-button";
import DescargarPdfButton from "../descargar-pdf-button";

import { leer } from "@/lib/supabase/leer";
interface ItemConVersion extends ViajeroFichaItem {
  parent_item_id: string | null;
  pedido_versiones: { pedido_id: string } | null;
}

export default async function ViajeroLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { id } = await params;
  const { ids } = await searchParams;
  const itemIds = (ids ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (itemIds.length === 0) {
    notFound();
  }

  const supabase = await createClient();

  const pedido = await leer(
    supabase
    .from("pedidos")
    .select("numero_pedido, proyectos ( nombre, cliente )")
    .eq("id", id)
    .maybeSingle<ViajeroFichaPedido>(),
    "pedidos"
  );

  if (!pedido) {
    notFound();
  }

  // Igual que en la ficha individual: el filtro sobre la relación embebida
  // evita mezclar ítems de otro pedido si alguien edita la URL a mano.
  const items = await leer(
    supabase
    .from("planeacion_items")
    .select(
      "id, item_code, tipo_registro, tipo_material, modelo, descripcion, cantidad_total, unidad, acabados, observaciones, parent_item_id, fases_taller, fila_excel_origen, pedido_versiones!inner ( pedido_id )"
    )
    .in("id", itemIds)
    .eq("pedido_versiones.pedido_id", id)
    .order("fila_excel_origen")
    .returns<(ItemConVersion & { fila_excel_origen: number | null })[]>(),
    "planeacion_items"
  );

  if (!items || items.length === 0) {
    notFound();
  }

  const parentIds = Array.from(
    new Set(items.filter((i) => i.tipo_registro === "FU" && i.parent_item_id).map((i) => i.parent_item_id as string))
  );

  const padresPorId = new Map<string, ViajeroFichaPadre>();
  if (parentIds.length > 0) {
    const padres = await leer(
      supabase
      .from("planeacion_items")
      .select("id, item_code, descripcion")
      .in("id", parentIds)
      .returns<(ViajeroFichaPadre & { id: string })[]>(),
      "planeacion_items"
    );
    for (const p of padres ?? []) {
      padresPorId.set(p.id, { item_code: p.item_code, descripcion: p.descripcion });
    }
  }

  const foliosRows = await leer(
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
  const folioPorItem = new Map((foliosRows ?? []).map((f) => [f.planeacion_item_id, f.folio]));

  const baseUrl = await getBaseUrl();
  const imagenesPorItem = await getImagenesPorItem(
    supabase,
    items.map((i) => i.id)
  );
  const nombreArchivo = nombreArchivoSeguro(
    `${pedido.numero_pedido} ${pedido.proyectos?.nombre ?? ""} - Reporte.pdf`
  );

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6 print:max-w-none print:p-0">
      <div className="flex items-center justify-end print:hidden">
        <div className="flex gap-2">
          <DescargarPdfButton nombreArchivo={nombreArchivo} />
          <ImprimirButton sufijo={` (${items.length} ítems)`} />
        </div>
      </div>

      <div className="flex flex-col gap-10">
        {items.map((item, i) => (
          <div
            key={item.id}
            className={i < items.length - 1 ? "border-b border-gray-200 pb-10 print:break-after-page print:border-none" : ""}
          >
            <ViajeroFicha
              pedido={pedido}
              item={item}
              padre={item.parent_item_id ? padresPorId.get(item.parent_item_id) ?? null : null}
              folio={folioPorItem.get(item.id) ?? null}
              qrUrl={`${baseUrl}/produccion/pedidos/${id}/viajero/${item.id}`}
              imagenUrls={imagenesPorItem.get(item.id) ?? []}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
