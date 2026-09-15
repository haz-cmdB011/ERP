import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/site-url";
import { getImagenesPorItem } from "@/lib/planeacion/imagenes";
import ViajeroFicha, {
  type ViajeroFichaItem,
  type ViajeroFichaPadre,
  type ViajeroFichaPedido,
} from "../../viajero-ficha";
import ImprimirButton from "../../imprimir-button";

interface ItemConVersion extends ViajeroFichaItem {
  parent_item_id: string | null;
  pedido_versiones: { pedido_id: string } | null;
}

export default async function ViajeroPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const supabase = await createClient();

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("numero_pedido, proyectos ( nombre, cliente )")
    .eq("id", id)
    .maybeSingle<ViajeroFichaPedido>();

  if (!pedido) {
    notFound();
  }

  // El filtro sobre la relación embebida evita servir la hoja de un ítem
  // que pertenece a OTRO pedido si alguien edita el itemId en la URL.
  const { data: item } = await supabase
    .from("planeacion_items")
    .select(
      "id, item_code, tipo_registro, tipo_material, modelo, descripcion, cantidad_total, unidad, acabados, observaciones, parent_item_id, fases_taller, pedido_versiones!inner ( pedido_id )"
    )
    .eq("id", itemId)
    .eq("pedido_versiones.pedido_id", id)
    .maybeSingle<ItemConVersion>();

  if (!item) {
    notFound();
  }

  let padre: ViajeroFichaPadre | null = null;
  if (item.tipo_registro === "FU" && item.parent_item_id) {
    const { data } = await supabase
      .from("planeacion_items")
      .select("item_code, descripcion")
      .eq("id", item.parent_item_id)
      .maybeSingle<ViajeroFichaPadre>();
    padre = data ?? null;
  }

  const baseUrl = await getBaseUrl();
  const imagenesPorItem = await getImagenesPorItem(supabase, [item.id]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6 print:max-w-none print:p-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/produccion/pedidos/${id}`} className="text-sm text-gray-500 underline">
          ← Volver al pedido
        </Link>
        <ImprimirButton />
      </div>

      <ViajeroFicha
        pedido={pedido}
        item={item}
        padre={padre}
        qrUrl={`${baseUrl}/produccion/pedidos/${id}/viajero/${item.id}`}
        imagenUrls={imagenesPorItem.get(item.id) ?? []}
      />
    </main>
  );
}
