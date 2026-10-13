import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leer } from "@/lib/supabase/leer";
import { esUuid } from "@/lib/produccion/qr-viajero";
import { destinoDeLogin } from "@/lib/seguridad/ruta-protegida";

// Destino corto del QR de la Hoja de Viajero: /q/<ítem>. El QR lleva solo el id del ítem (la
// dirección completa de la hoja lleva dos ids y daba un código tan denso que el celular lo leía mal);
// aquí se busca el pedido del ítem y se redirige a su hoja. Las hojas ya impresas, que traen la
// dirección larga, siguen funcionando igual.
export default async function QrCortoPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  if (!esUuid(itemId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(destinoDeLogin(`/q/${itemId}`, ""));

  const item = await leer(
    supabase
      .from("planeacion_items")
      .select("pedido_versiones!inner ( pedido_id )")
      .eq("id", itemId)
      .maybeSingle<{ pedido_versiones: { pedido_id: string } | null }>(),
    "planeacion_items"
  );
  const pedidoId = item?.pedido_versiones?.pedido_id;
  if (!pedidoId) notFound();

  redirect(`/produccion/pedidos/${pedidoId}/viajero/${itemId.toLowerCase()}`);
}
