import BarraPestanas, { type ItemPestana } from "@/components/barra-pestanas";
import { createClient } from "@/lib/supabase/server";

export type PestanaPedido = "muebles" | "asignar" | "cambios";

// Las tres pantallas de un pedido: liberar sus muebles, asignarlos a equipos y, si Planeación lo
// subió más de una vez, ver qué cambió. "Cambios" solo aparece con más de una versión.
// `versiones` se puede pasar si la pantalla ya lo sabe; si no, se cuenta aquí.
export default async function PestanasPedido({
  pedidoId,
  activa,
  versiones,
}: {
  pedidoId: string;
  activa: PestanaPedido;
  versiones?: number;
}) {
  let total = versiones;
  if (total === undefined) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("pedido_versiones")
      .select("id", { count: "exact", head: true })
      .eq("pedido_id", pedidoId);
    total = count ?? 0;
  }
  const base = `/produccion/pedidos/${pedidoId}`;
  const items: ItemPestana[] = [
    { id: "muebles", etiqueta: "Muebles", href: base },
  ];
  // Asignar a equipos se hace desde el carrito y el panel de asignación: la pestaña solo aparece en
  // la pantalla de asignaciones del PM (a la que llegan el QR y el tablero).
  if (activa === "asignar") {
    items.push({ id: "asignar", etiqueta: "Asignar a equipos", href: `${base}/asignaciones` });
  }
  if (total > 1 || activa === "cambios") {
    items.push({ id: "cambios", etiqueta: "Cambios", href: `${base}/cambios` });
  }
  return <BarraPestanas items={items} activa={activa} etiqueta="Partes del pedido" />;
}
