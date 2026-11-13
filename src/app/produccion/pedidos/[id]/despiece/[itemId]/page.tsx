import type { Metadata } from "next";
import MigasPedido from "../../migas-pedido";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import { esUuid } from "@/lib/produccion/qr-viajero";
import { cargarDespieceMueble, leerItemDespiece } from "@/lib/produccion/despiece-db";
import DespieceEditor from "./despiece-editor";

export const metadata: Metadata = { title: "Despiece" };

// Despiece de un mueble (ítem padre). Antes de que el trabajador lo haga, el
// sistema propone uno con los componentes (hijos) del PM; el trabajador lo
// acepta o lo arma como le sirva en el taller. Ver src/lib/produccion/despiece.ts.
// También se hace desde el carrito (en una ventana) con los mismos datos.
export default async function DespiecePage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  if (!esUuid(id) || !esUuid(itemId)) notFound();

  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);

  const item = await leerItemDespiece(supabase, itemId);
  const pedido = item?.pedido_versiones?.pedidos;
  if (!item || !pedido || item.pedido_versiones?.pedido_id !== id || pedido.eliminado_en) notFound();

  // El despiece es del mueble: el de un componente lleva a su mueble.
  if (item.tipo_registro === "FU" && item.parent_item_id) {
    redirect(`/produccion/pedidos/${id}/despiece/${item.parent_item_id}`);
  }
  if (item.tipo_registro !== "MO") notFound();

  const datos = await cargarDespieceMueble(supabase, item);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <MigasPedido pedidoId={id} cola={[{ etiqueta: `Despiece · Ítem ${item.item_code}` }]} />
      <header className="flex flex-col gap-1 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {pedido.numero_pedido} · Ítem {item.item_code}
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Despiece{item.modelo ? ` — ${item.modelo}` : ""}
        </h1>
        {pedido.proyectos && (
          <p className="text-sm text-slate-600">
            {pedido.proyectos.nombre} — {pedido.proyectos.cliente}
          </p>
        )}
        {item.descripcion && (
          <p className="line-clamp-3 text-sm text-slate-500">{item.descripcion.split("\n")[0]}</p>
        )}
      </header>

      <DespieceEditor
        // Al cambiar la versión guardada (otra persona, o tras guardar) se arma de nuevo.
        key={datos.version}
        {...datos}
        puedeEditar={puedeEditarProduccion(perfil) && !datos.motivoBloqueo}
      />
    </main>
  );
}
