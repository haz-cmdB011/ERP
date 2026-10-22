import type { Metadata } from "next";
import CambiosVersiones from "@/components/cambios-versiones";
import Migas from "@/components/migas";
import { createClient } from "@/lib/supabase/server";
import { tituloPedido } from "@/lib/planeacion/titulo-pedido";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return tituloPedido((await params).id, "Cambios ");
}

// Qué cambió entre dos versiones del PM (ver src/components/cambios-versiones.tsx).
export default async function CambiosPedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ de?: string; a?: string; ver?: string }>;
}) {
  const { id } = await params;
  const { de, a, ver } = await searchParams;
  // Migas de pan (en Planeación reemplazan al botón Regresar): Pedidos › O.T. › PM › Cambios.
  const { data: pedido } = await (await createClient())
    .from("pedidos")
    .select("numero_pedido, orden_trabajo")
    .eq("id", id)
    .maybeSingle<{ numero_pedido: string; orden_trabajo: string | null }>();
  return (
    <>
      {pedido && (
        <Migas
          className="mx-auto max-w-5xl px-4 pt-4 sm:px-6"
          items={[
            { etiqueta: "Pedidos", href: "/planeacion" },
            ...(pedido.orden_trabajo
              ? [{ etiqueta: `O.T. ${pedido.orden_trabajo}`, href: `/planeacion/ot/${encodeURIComponent(pedido.orden_trabajo)}` }]
              : []),
            { etiqueta: pedido.numero_pedido, href: `/planeacion/pedidos/${id}` },
            { etiqueta: "Cambios entre versiones" },
          ]}
        />
      )}
      <CambiosVersiones pedidoId={id} area="planeacion" de={de} a={a} ver={ver} />
    </>
  );
}
