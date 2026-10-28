import Migas, { type Miga } from "@/components/migas";
import { createClient } from "@/lib/supabase/server";

// Migas de las pantallas de un pedido: "Pedidos › O.T. 157-26 › PM157-26 › Hoja de viajero".
// `cola` son los tramos que siguen al PM; sin ellos el PM es la pantalla actual. Lee solo el número
// y la O.T. del pedido (una consulta mínima), para que cada pantalla no repita esa lógica.
export default async function MigasPedido({
  pedidoId,
  cola = [],
  className = "",
}: {
  pedidoId: string;
  cola?: Miga[];
  className?: string;
}) {
  const supabase = await createClient();
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("numero_pedido, orden_trabajo")
    .eq("id", pedidoId)
    .maybeSingle<{ numero_pedido: string; orden_trabajo: string | null }>();

  const items: Miga[] = [{ etiqueta: "Pedidos", href: "/produccion/pedidos" }];
  if (pedido?.orden_trabajo) {
    items.push({
      etiqueta: `O.T. ${pedido.orden_trabajo}`,
      href: `/produccion/ot/${encodeURIComponent(pedido.orden_trabajo)}`,
    });
  }
  items.push({
    etiqueta: pedido?.numero_pedido ?? "Pedido",
    href: cola.length > 0 ? `/produccion/pedidos/${pedidoId}` : undefined,
  });
  items.push(...cola);
  return <Migas items={items} className={className} />;
}
