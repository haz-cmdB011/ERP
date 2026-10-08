import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/site-url";
import { getImagenesPorItem } from "@/lib/planeacion/imagenes";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";
import ViajeroFicha, {
  type ViajeroFichaItem,
  type ViajeroFichaPadre,
  type ViajeroFichaPedido,
} from "../../viajero-ficha";
import ImprimirButton from "../../imprimir-button";
import DescargarPdfButton from "../../descargar-pdf-button";

import { leer } from "@/lib/supabase/leer";
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

  // El filtro sobre la relación embebida evita servir la hoja de un ítem
  // que pertenece a OTRO pedido si alguien edita el itemId en la URL.
  const item = await leer(
    supabase
    .from("planeacion_items")
    .select(
      "id, item_code, tipo_registro, tipo_material, modelo, descripcion, cantidad_total, unidad, acabados, observaciones, parent_item_id, fases_taller, pedido_versiones!inner ( pedido_id )"
    )
    .eq("id", itemId)
    .eq("pedido_versiones.pedido_id", id)
    .maybeSingle<ItemConVersion>(),
    "planeacion_items"
  );

  if (!item) {
    notFound();
  }

  let padre: ViajeroFichaPadre | null = null;
  if (item.tipo_registro === "FU" && item.parent_item_id) {
    const data = await leer(
      supabase
      .from("planeacion_items")
      .select("item_code, descripcion")
      .eq("id", item.parent_item_id)
      .maybeSingle<ViajeroFichaPadre>(),
      "planeacion_items"
    );
    padre = data ?? null;
  }

  const folioRow = await leer(
    supabase
    .from("folios_produccion")
    .select("folio")
    .eq("planeacion_item_id", item.id)
    .maybeSingle<{ folio: string }>(),
    "folios_produccion"
  );

  const baseUrl = await getBaseUrl();
  const imagenesPorItem = await getImagenesPorItem(supabase, [item.id]);
  const nombreArchivo = nombreArchivoSeguro(
    `${pedido.numero_pedido} ${pedido.proyectos?.nombre ?? ""} - Item ${item.item_code}.pdf`
  );

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6 print:max-w-none print:p-0">
      <div className="flex items-center justify-end print:hidden">
        <div className="flex gap-2">
          <DescargarPdfButton nombreArchivo={nombreArchivo} />
          <ImprimirButton />
        </div>
      </div>

      <ViajeroFicha
        pedido={pedido}
        item={item}
        padre={padre}
        folio={folioRow?.folio ?? null}
        qrUrl={`${baseUrl}/produccion/pedidos/${id}/viajero/${item.id}`}
        imagenUrls={imagenesPorItem.get(item.id) ?? []}
      />
    </main>
  );
}
