import type { Metadata } from "next";
import MigasPedido from "../migas-pedido";
import CambiosVersiones from "@/components/cambios-versiones";
import { tituloPedido } from "@/lib/planeacion/titulo-pedido";
import PestanasPedido from "../pestanas-pedido";

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
  return (
    <>
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pt-4 sm:px-6">
        <MigasPedido pedidoId={id} />
        <PestanasPedido pedidoId={id} activa="cambios" />
      </div>
      <CambiosVersiones pedidoId={id} area="produccion" de={de} a={a} ver={ver} />
    </>
  );
}
