import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import {
  PROCESO_LABELS,
  diasEnProceso,
  formatoFecha,
  hoyMexico,
  type AsignacionResumen,
} from "@/lib/produccion/asignaciones";
import { enTaller } from "@/lib/produccion/atrasos";
import { plazosDePedidos } from "@/lib/produccion/cargar-taller";
import { esUuid } from "@/lib/produccion/qr-viajero";
import RegistrarEntrega from "../../asignaciones/registrar-entrega";
import { EstadoAsignacionBadge } from "../../asignaciones/detalle-asignacion";
import ChipPlazo from "../../chip-plazo";

import { leer } from "@/lib/supabase/leer";
export const metadata: Metadata = { title: "Registrar entrega" };

interface ItemEscaneado {
  id: string;
  item_code: number;
  tipo_registro: "MO" | "FU";
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  parent_item_id: string | null;
  estado_liberacion: string;
  eliminacion_solicitada_en: string | null;
  estado_revision: string | null;
  pedido_versiones: {
    pedido_id: string;
    numero_version: number;
    es_version_activa: boolean;
    pedidos: {
      id: string;
      numero_pedido: string;
      cancelado_en: string | null;
      eliminado_en: string | null;
      proyectos: { nombre: string; cliente: string } | null;
    } | null;
  } | null;
}

// Pantalla a la que lleva el escáner: el mueble del QR, lo que tiene
// asignado y un botón grande para registrar su entrega desde el celular.
export default async function MuebleEscaneadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ componente?: string }>;
}) {
  const { itemId } = await params;
  const { componente } = await searchParams;
  if (!esUuid(itemId)) notFound();

  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  const puedeEditar = puedeEditarProduccion(perfil);

  const item = await leer(
    supabase
    .from("planeacion_items")
    .select(
      "id, item_code, tipo_registro, modelo, descripcion, cantidad_total, unidad, parent_item_id, estado_liberacion, eliminacion_solicitada_en, estado_revision, pedido_versiones!inner ( pedido_id, numero_version, es_version_activa, pedidos!inner ( id, numero_pedido, cancelado_en, eliminado_en, proyectos ( nombre, cliente ) ) )"
    )
    .eq("id", itemId)
    .maybeSingle<ItemEscaneado>(),
    "planeacion_items"
  );
  const pedido = item?.pedido_versiones?.pedidos;
  if (!item || !pedido || pedido.eliminado_en) notFound();

  // Solo los muebles (MO) se asignan: el QR de un componente lleva a su mueble.
  if (item.tipo_registro === "FU" && item.parent_item_id) {
    redirect(`/produccion/escanear/${item.parent_item_id}?componente=${item.item_code}`);
  }

  const hoy = hoyMexico();
  const [asignaciones, folio, plazos] = await Promise.all([
    leer(
      supabase
        .from("asignaciones_produccion_resumen")
        .select("*")
        .eq("planeacion_item_id", item.id)
        .order("fecha_asignacion")
        .order("creado_en")
        .returns<AsignacionResumen[]>(),
      "asignaciones_produccion_resumen"
    ),
    leer(
      supabase
        .from("folios_produccion")
        .select("folio")
        .eq("planeacion_item_id", item.id)
        .maybeSingle<{ folio: string }>(),
      "folios_produccion"
    ),
    plazosDePedidos(supabase, [pedido.id], hoy),
  ]);

  const todas = asignaciones ?? [];
  const activas = todas.filter(enTaller);
  const otras = todas.filter((a) => !enTaller(a));
  const plazo = plazos.get(pedido.id);
  const liberado = item.estado_liberacion === "enviado_a_produccion";
  const sinTrabajo =
    !!pedido.cancelado_en || !!item.eliminacion_solicitada_en || item.estado_revision === "cancelado";
  const hrefAsignar = `/produccion/pedidos/${pedido.id}/asignaciones`;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-1 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {pedido.numero_pedido}
          {folio?.folio ? ` · ${folio.folio}` : ""}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {item.modelo ?? `Ítem ${item.item_code}`}
        </h1>
        <p className="text-sm text-slate-600">
          {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
        </p>
        <p className="line-clamp-3 text-sm text-slate-500">{item.descripcion?.split("\n")[0]}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
          Ítem {item.item_code} · {Number(item.cantidad_total)} {item.unidad}
          {plazo && <ChipPlazo plazo={plazo} fecha={plazo.fecha} />}
        </p>
      </header>

      {componente && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          El QR era del componente {componente}; aquí está su mueble.
        </p>
      )}
      {item.pedido_versiones && !item.pedido_versiones.es_version_activa && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Este QR es de una versión anterior del PM (v{item.pedido_versiones.numero_version}). Puede
          haber cambiado; revisa el pedido.
        </p>
      )}
      {sinTrabajo && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Este mueble o su PM está cancelado o eliminado: no debería seguir en taller.
        </p>
      )}
      {!liberado && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Este mueble todavía no está liberado a producción.
        </p>
      )}

      {activas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          <p>
            {todas.length === 0
              ? "No hay nada asignado de este mueble."
              : "No queda nada en taller de este mueble."}
          </p>
          {puedeEditar && liberado && !sinTrabajo && (
            <Link href={hrefAsignar} className="font-medium text-brand-700 hover:underline">
              Asignar a equipos →
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {activas.map((a) => {
            const pendiente = Math.round((Number(a.cantidad) - Number(a.entregado)) * 100) / 100;
            return (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900">{a.equipo}</p>
                    <p className="text-sm text-slate-600">
                      {PROCESO_LABELS[a.proceso]} · asignada {formatoFecha(a.fecha_asignacion)} ·{" "}
                      {diasEnProceso(a, hoy) ?? 0} d
                    </p>
                  </div>
                  <EstadoAsignacionBadge estado={a.estado} />
                </div>
                <p className="text-sm text-slate-700">
                  Entregadas{" "}
                  <span className="font-semibold text-slate-900">
                    {Number(a.entregado)} de {Number(a.cantidad)}
                  </span>{" "}
                  {a.unidad ?? ""} · faltan <span className="font-semibold text-slate-900">{pendiente}</span>
                </p>
                {puedeEditar ? (
                  <RegistrarEntrega
                    asignacionId={a.id}
                    descripcion={`${a.numero_pedido} · ${a.modelo ?? `ítem ${a.item_code}`} · ${a.equipo}`}
                    pendiente={pendiente}
                    unidad={a.unidad}
                    fechaAsignacion={a.fecha_asignacion}
                  />
                ) : (
                  <p className="text-xs text-slate-500">Tu usuario no puede registrar entregas.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {otras.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
            Ya entregadas o canceladas ({otras.length})
          </summary>
          <ul className="flex flex-col divide-y divide-slate-100 border-t border-slate-100">
            {otras.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="font-medium text-slate-900">{a.equipo}</span>
                <span className="text-slate-600">{PROCESO_LABELS[a.proceso]}</span>
                <span className="text-slate-600">
                  {Number(a.entregado)}/{Number(a.cantidad)} {a.unidad ?? ""}
                </span>
                <EstadoAsignacionBadge estado={a.estado} />
              </li>
            ))}
          </ul>
        </details>
      )}

      <nav className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row">
        <Link
          href="/produccion/escanear"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400"
        >
          Escanear otro
        </Link>
        <Link
          href={hrefAsignar}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Ver el PM
        </Link>
      </nav>
    </main>
  );
}
