import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esUuid } from "@/lib/produccion/qr-viajero";

import { leer } from "@/lib/supabase/leer";
interface ItemEscaneado {
  id: string;
  pedido_versiones: {
    pedido_id: string;
    numero_version: number;
    pedidos: { eliminado_en: string | null } | null;
  } | null;
}

// A donde lleva el escáner de Calidad: la pantalla del pedido, enfocada en el
// mueble del QR (con sus componentes) y en la versión a la que pertenece, para
// evaluarlo ahí mismo.
export default async function MuebleEscaneadoCalidadPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  if (!esUuid(itemId)) notFound();

  const supabase = await createClient();
  const item = await leer(
    supabase
    .from("planeacion_items")
    .select("id, pedido_versiones!inner ( pedido_id, numero_version, pedidos!inner ( eliminado_en ) )")
    .eq("id", itemId)
    .maybeSingle<ItemEscaneado>(),
    "planeacion_items"
  );
  const version = item?.pedido_versiones;
  // Un pedido eliminado deja de existir para Calidad (igual que su pantalla de pedido).
  if (!item || !version || version.pedidos?.eliminado_en) notFound();

  redirect(`/calidad/pedidos/${version.pedido_id}?version=${version.numero_version}&item=${item.id}`);
}
