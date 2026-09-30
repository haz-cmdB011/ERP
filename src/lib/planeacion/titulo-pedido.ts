import { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

// Número de PM para el título de la pestaña del navegador. cache(): una sola
// consulta por petición aunque lo pidan varios generateMetadata.
const numeroPedidoPorId = cache(async (id: string): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pedidos")
    .select("numero_pedido")
    .eq("id", id)
    .maybeSingle<{ numero_pedido: string }>();
  return data?.numero_pedido ?? null;
});

// Título de una página de PM: el número de PM con un prefijo opcional
// (ej. "Cambios PM107-26").
export async function tituloPedido(id: string, prefijo = ""): Promise<Metadata> {
  const numero = await numeroPedidoPorId(id);
  return { title: numero ? `${prefijo}${numero}` : "Pedido" };
}

// generateMetadata para las páginas de un PM (/<área>/pedidos/[id]).
export async function metadataPedido({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return tituloPedido((await params).id);
}
