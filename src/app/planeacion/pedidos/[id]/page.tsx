import Link from "next/link";
import Migas from "@/components/migas";
import Pestanas, { idPanel, idPestana } from "@/components/pestanas";
import { metadataPedido } from "@/lib/planeacion/titulo-pedido";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarPlaneacion } from "@/lib/auth/get-perfil";
import type { EstadoRevision } from "@/lib/planeacion/estado-revision";
import CancelarPedido from "./cancelar-pedido";
import EstadoVacio from "@/components/estado-vacio";
import ItemsTabla, { type MuebleTabla } from "./items-tabla";
import { getImagenesConGrandePorItem, type ImagenItemUrls } from "@/lib/planeacion/imagenes";
import { getPlanosPorItem, pmDePlanos, type PlanoLink } from "@/lib/planos/planos-por-item";
import { resumirCancelacion, type ItemParaCancelar } from "@/lib/planeacion/resumen-cancelacion";
import LineaTiempoPm from "./linea-tiempo-pm";
import { armarLineaTiempo, type LineaTiempo } from "@/lib/planeacion/linea-tiempo";
import { asignacionesDePedido, idsConInformeDeCalidad } from "@/lib/planeacion/linea-tiempo-db";
import { cargarRutas, type RutaGuardada } from "@/lib/produccion/rutas-db";
import { cargarPartes } from "@/lib/produccion/partes-db";
import type { ParteMueble } from "@/lib/produccion/flujo-mueble";
import { formatoFechaDMA } from "@/lib/resumen/entrega";

import { paginarTodo } from "@/lib/supabase/paginar";
interface VersionRow {
  id: string;
  numero_version: number;
  es_version_activa: boolean;
  notas: string | null;
  created_at: string;
  cargas_archivo: {
    nombre_archivo: string;
    filas_totales: number | null;
    filas_exitosas: number | null;
    estado: string;
  } | null;
}

interface ItemRow {
  id: string;
  item_code: number;
  tipo_registro: "MO" | "FU";
  tipo_material: string | null;
  modelo: string | null;
  descripcion: string | null;
  cantidad_x_mueble: number | null;
  unidad: string | null;
  cantidad_total: number;
  parent_item_id: string | null;
  fila_excel_origen: number | null;
  estado_liberacion: string;
  estado_revision: EstadoRevision;
  motivo_cancelacion: string | null;
  eliminacion_solicitada_en: string | null;
}

export const generateMetadata = metadataPedido;

export default async function PedidoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; modelo?: string; pestana?: string }>;
}) {
  const { id } = await params;
  const { version, modelo, pestana } = await searchParams;
  const supabase = await createClient();
  // Perfil, pedido y versiones no dependen entre sí: se piden a la vez (un solo
  // viaje a la base en vez de tres seguidos).
  const perfilPromesa = getPerfilActual(supabase);

  const pedidoPromesa = supabase
    .from("pedidos")
    .select(
      "id, numero_pedido, orden_trabajo, fecha_pedido, fecha_entrega, estado, cancelado_en, motivo_cancelacion, eliminado_definitivo_en, proyectos ( nombre, cliente )"
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      numero_pedido: string;
      orden_trabajo: string | null;
      fecha_pedido: string | null;
      fecha_entrega: string | null;
      estado: string;
      cancelado_en: string | null;
      motivo_cancelacion: string | null;
      eliminado_definitivo_en: string | null;
      proyectos: { nombre: string; cliente: string } | null;
    }>();

  const versionesPromesa = supabase
    .from("pedido_versiones")
    .select(
      "id, numero_version, es_version_activa, notas, created_at, cargas_archivo:carga_id ( nombre_archivo, filas_totales, filas_exitosas, estado )"
    )
    .eq("pedido_id", id)
    .order("numero_version", { ascending: false })
    .returns<VersionRow[]>();

  const [perfil, { data: pedido }, { data: versiones }] = await Promise.all([
    perfilPromesa,
    pedidoPromesa,
    versionesPromesa,
  ]);
  const puedeEditar = puedeEditarPlaneacion(perfil);

  if (!pedido) {
    notFound();
  }

  const versionSeleccionada =
    (version && versiones?.find((v) => String(v.numero_version) === version)) ||
    versiones?.find((v) => v.es_version_activa) ||
    versiones?.[0] ||
    null;

  // Dos pestañas (?pestana=): Muebles (por omisión) y Versiones (selector, qué cambió y Seguimiento).
  const pestanaActiva: "muebles" | "versiones" = pestana === "versiones" ? "versiones" : "muebles";
  const versionActiva = versiones?.find((v) => v.es_version_activa) ?? versiones?.[0] ?? null;
  // La pestaña Versiones trabaja siempre con la activa (el Seguimiento solo tiene sentido para ella).
  const versionVista = pestanaActiva === "versiones" ? versionActiva : versionSeleccionada;

  // Para decir qué se cancelaría antes de confirmar (siempre sobre la versión
  // activa, aunque se esté viendo otra). Solo lo necesita quien puede cancelar.
  const itemsParaCancelar =
    pestanaActiva === "muebles" && puedeEditar && !pedido.cancelado_en && versionActiva
      ? await paginarTodo<ItemParaCancelar>(
          (desde, hasta) =>
            supabase
              .from("planeacion_items")
              .select("id, tipo_registro, estado_liberacion, estado_revision, eliminacion_solicitada_en")
              .eq("pedido_version_id", versionActiva.id)
              .order("id")
              .range(desde, hasta)
              .returns<ItemParaCancelar[]>(),
          { contexto: "planeacion_items" }
        )
      : null;
  const resumenCancelacion = itemsParaCancelar ? resumirCancelacion(itemsParaCancelar) : null;

  const items = versionVista
    ? // Por páginas: Supabase corta cada respuesta en 1000 filas sin avisar, y un PM
      // grande se vería incompleto.
      await paginarTodo<ItemRow>(
        (desde, hasta) =>
          supabase
            .from("planeacion_items")
            .select(
              "id, item_code, tipo_registro, tipo_material, modelo, descripcion, cantidad_x_mueble, unidad, cantidad_total, parent_item_id, fila_excel_origen, estado_liberacion, estado_revision, motivo_cancelacion, eliminacion_solicitada_en"
            )
            .eq("pedido_version_id", versionVista.id)
            .order("fila_excel_origen")
            .order("id")
            .range(desde, hasta)
            .returns<ItemRow[]>(),
        { contexto: "planeacion_items" }
      )
    : null;

  // Seguimiento del PM (liberado, asignado, entregado, evaluado): solo tiene
  // sentido para la versión activa, que es la que Producción y Calidad usan.
  let tiempo: LineaTiempo | null = null;
  if (pestanaActiva === "versiones" && versionVista?.es_version_activa && items && items.length > 0) {
    const liberadosIds = items
      .filter(
        (i) =>
          i.estado_liberacion === "enviado_a_produccion" &&
          i.estado_revision !== "cancelado" &&
          !i.eliminacion_solicitada_en
      )
      .map((i) => i.id);
    const mueblesIds = items.filter((i) => i.tipo_registro === "MO" && liberadosIds.includes(i.id)).map((i) => i.id);
    const [asignaciones, conInforme, rutas, partes] = await Promise.all([
      asignacionesDePedido(supabase, id),
      idsConInformeDeCalidad(supabase, liberadosIds),
      // Es un resumen: sin rutas cuenta un paso por proceso en vez de tumbar la pantalla.
      cargarRutas(supabase, mueblesIds).catch(() => new Map<string, RutaGuardada>()),
      // Igual sin partes: cuenta las que ya tienen asignaciones.
      cargarPartes(supabase, mueblesIds).catch(() => new Map<string, ParteMueble[]>()),
    ]);
    tiempo = armarLineaTiempo(
      items,
      asignaciones,
      conInforme,
      new Map([...rutas].map(([itemId, r]) => [itemId, r.pasos.filter((p) => p.id !== null) as { id: string; proceso: string }[]])),
      new Map([...partes].map(([itemId, ps]) => [itemId, ps.map((p) => p.id)]))
    );
  }

  // Imágenes y planos solo se leen para la pestaña Muebles, que es la que los muestra.
  const itemIds = (items ?? []).map((i) => i.id);
  const [imagenesPorItem, planosPorItem] =
    pestanaActiva === "muebles"
      ? await Promise.all([
          getImagenesConGrandePorItem(supabase, itemIds),
          getPlanosPorItem(supabase, pmDePlanos(pedido), items ?? []),
        ])
      : [new Map<string, ImagenItemUrls[]>(), {} as Record<string, PlanoLink[]>];

  // Los ítems cancelados o enviados a la papelera de Producción salen de la
  // vista normal: los cancelados viven en /planeacion/archivo, y los de
  // papelera se gestionan desde la Papelera de Producción.
  const itemsVisibles = (items ?? []).filter(
    (i) => i.estado_revision !== "cancelado" && !i.eliminacion_solicitada_en
  );

  const mo = itemsVisibles.filter((i) => i.tipo_registro === "MO");
  const idsMoVisibles = new Set(mo.map((m) => m.id));
  const fuPorPadre = new Map<string, ItemRow[]>();
  for (const item of itemsVisibles) {
    if (item.tipo_registro === "FU" && item.parent_item_id && idsMoVisibles.has(item.parent_item_id)) {
      const lista = fuPorPadre.get(item.parent_item_id) ?? [];
      lista.push(item);
      fuPorPadre.set(item.parent_item_id, lista);
    }
  }
  // FU cuyo MO padre se ocultó (cancelado o en papelera) pero que el FU en
  // sí sigue activo: no se pierden, se muestran aparte en vez de quedar
  // huérfanos sin ningún lugar donde verse.
  const fuSueltos = itemsVisibles.filter(
    (i) => i.tipo_registro === "FU" && (!i.parent_item_id || !idsMoVisibles.has(i.parent_item_id))
  );

  // Los sueltos van al final como filas sin hijos, para que también
  // entren en el filtro por modelo.
  const muebles: MuebleTabla[] = [
    ...mo.map((m) => ({ ...m, hijos: fuPorPadre.get(m.id) ?? [] })),
    ...fuSueltos.map((f) => ({ ...f, hijos: [] })),
  ];

  // Para no perder la versión elegida al cambiar de pestaña.
  const base = `/planeacion/pedidos/${id}`;
  const conVersion = version ? `version=${encodeURIComponent(version)}` : "";
  const hrefPestana = (p: "muebles" | "versiones") => {
    const qs = [p === "versiones" ? "pestana=versiones" : "", conVersion].filter(Boolean).join("&");
    return qs ? `${base}?${qs}` : base;
  };

  const tarjetaCancelar = (
    <CancelarPedido
      pedidoId={id}
      cancelacion={{
        cancelado_en: pedido.cancelado_en,
        motivo_cancelacion: pedido.motivo_cancelacion,
        eliminado_definitivo_en: pedido.eliminado_definitivo_en,
      }}
      puedeEditar={puedeEditar}
      resumen={resumenCancelacion}
    />
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Migas
        items={[
          { etiqueta: "Pedidos", href: "/planeacion" },
          ...(pedido.orden_trabajo
            ? [{ etiqueta: `O.T. ${pedido.orden_trabajo}`, href: `/planeacion/ot/${encodeURIComponent(pedido.orden_trabajo)}` }]
            : []),
          { etiqueta: pedido.numero_pedido },
        ]}
      />
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{pedido.numero_pedido}</h1>
        <p className="text-sm text-slate-600">
          {pedido.proyectos?.nombre} — {pedido.proyectos?.cliente}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Entrega: {formatoFechaDMA(pedido.fecha_entrega)}
          {versionActiva && ` · Versión ${versionActiva.numero_version}`}
        </p>
      </div>

      {/* Un pedido ya cancelado avisa arriba (y deja reactivarlo). Cancelar uno vigente va al final de Muebles. */}
      {pedido.cancelado_en && tarjetaCancelar}

      {!versionSeleccionada ? (
        <>
          <EstadoVacio
            titulo="Este pedido no tiene versiones"
            descripcion="Carga su Excel para ver aquí sus muebles."
            accion={{ href: "/planeacion/upload", etiqueta: "Cargar Excel" }}
          />
          {!pedido.cancelado_en && tarjetaCancelar}
        </>
      ) : (
        <>
          <Pestanas
            base="pedido"
            etiqueta="Secciones del pedido"
            activa={pestanaActiva}
            items={[
              { id: "muebles", etiqueta: "Muebles", icono: "muebles", href: hrefPestana("muebles") },
              { id: "versiones", etiqueta: "Versiones", icono: "versiones", href: hrefPestana("versiones") },
            ]}
          />
          <div
            role="tabpanel"
            id={idPanel("pedido")}
            aria-labelledby={idPestana("pedido", pestanaActiva)}
            tabIndex={-1}
            className="flex flex-col gap-6"
          >
            {pestanaActiva === "muebles" ? (
              <>
                {!versionSeleccionada.es_version_activa && (
                  <p className="text-sm text-amber-700">
                    Estás viendo la versión {versionSeleccionada.numero_version}, que ya no es la activa.{" "}
                    <Link href={base} className="font-medium underline">
                      Ver la activa
                    </Link>
                  </p>
                )}
                {muebles.length > 0 && (
                  <ItemsTabla
                    muebles={muebles}
                    imagenesPorItem={Object.fromEntries(imagenesPorItem)}
                    planosPorItem={planosPorItem}
                    puedeEditar={puedeEditar}
                    filtroInicial={modelo ?? ""}
                  />
                )}
                {/* Lo último de la pantalla, siempre a la vista (no se muestra sin permiso de editar). */}
                {!pedido.cancelado_en && tarjetaCancelar}
              </>
            ) : (
              <>
                <section className="flex flex-col gap-3">
                  <p className="text-sm text-slate-600">
                    Cada carga del Excel crea una versión. La <strong>activa</strong> es la que usa Producción.
                  </p>
                  <ul className="flex flex-col gap-2">
                    {(versiones ?? []).map((v) => (
                      <li
                        key={v.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                      >
                        <div>
                          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            Versión {v.numero_version}
                            {v.es_version_activa && (
                              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-800">
                                activa
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">Cargada el {fechaCarga(v.created_at)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`${base}?version=${v.numero_version}`}
                            className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Ver muebles
                          </Link>
                          {v.numero_version > 1 && (
                            <Link
                              href={`${base}/cambios?a=${v.numero_version}`}
                              className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-brand-700 hover:bg-slate-50"
                            >
                              Qué cambió
                            </Link>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
                {tiempo && <LineaTiempoPm tiempo={tiempo} abierto />}
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function fechaCarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
