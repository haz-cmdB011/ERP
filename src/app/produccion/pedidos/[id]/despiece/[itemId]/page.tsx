import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import { leer } from "@/lib/supabase/leer";
import { esUuid } from "@/lib/produccion/qr-viajero";
import {
  lineasDesdeJson,
  sugerirDespiece,
  type HijoDespiece,
} from "@/lib/produccion/despiece";
import DespieceEditor from "./despiece-editor";

export const metadata: Metadata = { title: "Despiece" };

interface ItemDespiece {
  id: string;
  item_code: number;
  tipo_registro: "MO" | "FU";
  modelo: string | null;
  descripcion: string | null;
  tipo_material: string | null;
  unidad: string | null;
  cantidad_total: number;
  parent_item_id: string | null;
  eliminacion_solicitada_en: string | null;
  estado_revision: string | null;
  pedido_versiones: {
    pedido_id: string;
    es_version_activa: boolean;
    pedidos: {
      numero_pedido: string;
      cancelado_en: string | null;
      eliminado_en: string | null;
      proyectos: { nombre: string; cliente: string } | null;
    } | null;
  } | null;
}

interface DespieceGuardado {
  lineas: unknown;
  igual_a_sugerencia: boolean;
  actualizado_en: string;
}

// Despiece de un mueble (ítem padre). Antes de que el trabajador lo haga, el
// sistema propone uno con los componentes (hijos) del PM; el trabajador lo
// acepta o lo arma como le sirva en el taller. Ver src/lib/produccion/despiece.ts.
export default async function DespiecePage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  if (!esUuid(id) || !esUuid(itemId)) notFound();

  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);

  const item = await leer(
    supabase
      .from("planeacion_items")
      .select(
        "id, item_code, tipo_registro, modelo, descripcion, tipo_material, unidad, cantidad_total, parent_item_id, eliminacion_solicitada_en, estado_revision, pedido_versiones!inner ( pedido_id, es_version_activa, pedidos!inner ( numero_pedido, cancelado_en, eliminado_en, proyectos ( nombre, cliente ) ) )"
      )
      .eq("id", itemId)
      .maybeSingle<ItemDespiece>(),
    "planeacion_items"
  );
  const pedido = item?.pedido_versiones?.pedidos;
  if (!item || !pedido || item.pedido_versiones?.pedido_id !== id || pedido.eliminado_en) notFound();

  // El despiece es del mueble: el de un componente lleva a su mueble.
  if (item.tipo_registro === "FU" && item.parent_item_id) {
    redirect(`/produccion/pedidos/${id}/despiece/${item.parent_item_id}`);
  }
  if (item.tipo_registro !== "MO") notFound();

  const [hijos, guardado] = await Promise.all([
    leer(
      supabase
        .from("planeacion_items")
        .select(
          "id, item_code, modelo, descripcion, tipo_material, unidad, cantidad_x_mueble, cantidad_total, fila_excel_origen, eliminacion_solicitada_en, estado_revision"
        )
        .eq("parent_item_id", item.id)
        .returns<HijoDespiece[]>(),
      "planeacion_items"
    ),
    leer(
      supabase
        .from("despieces_produccion")
        .select("lineas, igual_a_sugerencia, actualizado_en")
        .eq("planeacion_item_id", item.id)
        .maybeSingle<DespieceGuardado>(),
      "despieces_produccion"
    ),
  ]);

  const sugerencia = sugerirDespiece(item, hijos ?? []);

  // Por qué solo se puede ver (la base lo exige igual): sin permiso de edición
  // no hay motivo que mostrar.
  let motivoBloqueo: string | null = null;
  if (!item.pedido_versiones?.es_version_activa) {
    motivoBloqueo = "Este ítem es de una versión anterior del PM. El despiece se hace en la versión activa.";
  } else if (pedido.cancelado_en || item.eliminacion_solicitada_en || item.estado_revision === "cancelado") {
    motivoBloqueo = "Este ítem o su PM está cancelado o eliminado.";
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-1 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {pedido.numero_pedido} · Ítem {item.item_code}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
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
        itemId={item.id}
        muebles={Number(item.cantidad_total) || 0}
        unidadMueble={item.unidad}
        sugerencia={sugerencia}
        guardado={
          guardado
            ? {
                lineas: lineasDesdeJson(guardado.lineas),
                igualASugerencia: guardado.igual_a_sugerencia,
                actualizadoEn: guardado.actualizado_en,
              }
            : null
        }
        puedeEditar={puedeEditarProduccion(perfil) && !motivoBloqueo}
        motivoBloqueo={motivoBloqueo}
      />
    </main>
  );
}
